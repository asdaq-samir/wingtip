package app.wingtipmaps.gateway.controller;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.apache.coyote.CloseNowException;
import org.hibernate.exception.ConstraintViolationException;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.util.DisconnectedClientHelper;

/**
 * Every failure answered as an RFC 9457 problem ({@link ProblemDetail},
 * {@code application/problem+json}): Spring MVC's own through
 * {@link ResponseEntityExceptionHandler}, this app's refusals as the
 * {@link ErrorResponseException}s they are, a unique-constraint clash, and
 * everything else as a 500 that leaks nothing. The pages and the phones
 * read {@code detail}; a failed validation lists its fields in
 * {@code errors}. A client that has gone is answered with nothing.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** A browser that left mid-response -- a nav log or detection stream
     *  it stopped reading, a tab closed -- is nobody's error, and there is
     *  nobody left to answer. Spring's own helper knows the signs (a
     *  broken pipe, a reset connection, Tomcat's client abort) and logs
     *  one line on its own category, at debug. Each used to be an ERROR
     *  "Unhandled exception" with a stack trace, then a second failure
     *  writing a JSON body into an NDJSON stream already under way. */
    private static final DisconnectedClientHelper DISCONNECTED =
            new DisconnectedClientHelper("app.wingtipmaps.gateway.disconnected-client");

    private static final Logger disconnected = LoggerFactory.getLogger("app.wingtipmaps.gateway.disconnected-client");

    /**
     * The same, in Tomcat's HTTP/2 words, which Spring's helper (written
     * for HTTP/1.1's broken pipe and reset connection) does not know: the
     * stream reset by the client while its request was still being read
     * or its response written, and a write to a stream already reset
     * ({@link CloseNowException}), wherever in the cause chain Spring MVC
     * left it. Seen while the phone's connector spoke HTTP/2: a page
     * reloaded there with a detection stream in flight logged each of
     * these as an ERROR with a stack trace, then a second failure writing
     * the 500's JSON into the NDJSON already under way -- 240 requests
     * cancelled mid-flight left 262 such lines, against 4 over HTTP/1.1.
     * That connector is HTTP/1.1 now (HttpsConnectorConfig says why);
     * this stays for any connector that speaks HTTP/2 again.
     */
    static boolean streamReset(Throwable ex) {
        Throwable cause = ex;
        for (int depth = 0; cause != null && depth < 10; depth++, cause = cause.getCause()) {
            if (cause instanceof CloseNowException) {
                return true;
            }
            String message = cause.getMessage();
            if (cause instanceof IOException && message != null && message.startsWith("Client reset the stream")) {
                return true;
            }
        }
        return false;
    }

    /** A failed {@code @Valid} check on a request body: Spring's 400
     *  problem, its detail naming each broken field (what the pages and the
     *  phones show) and {@code errors} listing them one by one. */
    @Override
    protected @Nullable ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<String> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(fieldError -> fieldError.getField() + ": " + fieldError.getDefaultMessage())
                .toList();
        ProblemDetail problem =
                ProblemDetail.forStatusAndDetail(status, "Invalid request: " + String.join("; ", errors));
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    /** A body that is not JSON, or not JSON this endpoint takes (a string
     *  where a number goes, a value past the end): the caller's mistake,
     *  a 400. Jackson's own words name this app's classes, so they stay in
     *  the log. */
    @Override
    protected @Nullable ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        log.debug("Unreadable request body: {}", ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, "The request's body could not be read");
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    /** This app's own refusals (NoSuchAircraftException,
     *  InstructorRefusedException, TrialUsedException,
     *  FlightServiceNotConnectedException, PlannerUnavailableException) are
     *  problems already; one that is the server's side, the planner not
     *  answering, is logged too. */
    @Override
    protected @Nullable ResponseEntity<Object> handleErrorResponseException(
            ErrorResponseException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (status.is5xxServerError()) {
            log.warn("Answered {}: {}", status.value(), ex.getBody().getDetail(), ex.getCause());
        }
        return super.handleErrorResponseException(ex, headers, status, request);
    }

    /** The one constraint a pilot can run into by what they typed: a tail
     *  number they already have on file (V3's aircraft table). */
    static final String TAIL_CONSTRAINT = "uq_aircraft_pilot_tail";

    /**
     * Handles a constraint the database refused. A tail number the pilot
     * already has ({@value #TAIL_CONSTRAINT}) is said as that; any other --
     * a nav log's checkpoint sequence, a foreign key, a missing value -- is
     * no fault of what the pilot typed, and was answered "That tail number
     * is already registered" all the same (the 6 Nov audit's S9).
     *
     * @param ex the underlying constraint failure, logged by the
     *     constraint's name only: the database's own text quotes the row's
     *     values (a tail number, an address), and the logs are kept 30 days
     *     (docs/privacy-inventory.md, "Logs")
     * @return 409, with a message that doesn't leak constraint/SQL internals
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        String constraint =
                ex.getCause() instanceof ConstraintViolationException violation ? violation.getConstraintName() : null;
        log.warn(
                "Data integrity violation: {}",
                constraint != null
                        ? constraint
                        : ex.getMostSpecificCause().getClass().getSimpleName());
        String detail = TAIL_CONSTRAINT.equalsIgnoreCase(constraint)
                ? "That tail number is already registered"
                : "That could not be saved: it conflicts with what is already saved. Reload and try again.";
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
    }

    /**
     * Catches everything not handled above -- the last line of defense
     * against an opaque, stack-trace-leaking default error page.
     *
     * <p>Spring MVC's own request failures -- no such resource, a
     * missing parameter, the wrong method -- are the superclass's, each
     * answered as the client error it is; any other exception that says
     * it is a client error is answered as that too.
     *
     * @param ex the unexpected exception, logged in full server-side
     * @param response the answer under way, which may already be committed
     * @return its own status for a client error Spring MVC names, else 500 with a generic message;
     *         nothing for a client that has gone, or once the response is committed
     */
    @ExceptionHandler(Exception.class)
    public @Nullable ResponseEntity<ProblemDetail> handleUnexpected(Exception ex, HttpServletResponse response) {
        if (DISCONNECTED.checkAndLogClientDisconnectedException(ex)) {
            return null;
        }
        if (streamReset(ex)) {
            disconnected.debug("Looks like the client has gone away: {}", ex.toString());
            return null;
        }
        if (response.isCommitted()) {
            // Part of an answer is already on its way (a stream): no body
            // can follow it, so the failure is logged and that is all.
            log.error("Failed after the response was sent", ex);
            return null;
        }
        if (ex instanceof ErrorResponse known && known.getStatusCode().is4xxClientError()) {
            return ResponseEntity.status(known.getStatusCode()).body(known.getBody());
        }
        log.error("Unhandled exception", ex);
        return ResponseEntity.internalServerError()
                .body(ProblemDetail.forStatusAndDetail(
                        HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred"));
    }
}
