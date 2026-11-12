package app.wingtipmaps.gateway.service;

import java.io.Serial;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Thrown when a request names an {@code aircraftId} that either
 *  doesn't exist or doesn't belong to the calling pilot -- the same
 *  "can't see it, so it isn't there" answer {@code findByIdAndPilotId}
 *  gives everywhere else, surfaced as an error here (rather than
 *  silently filing with no aircraft) because a request that names an
 *  id explicitly is asserting it should attach, not offering a hint.
 *  Answered as a 404 problem (ResponseEntityExceptionHandler). */
public class NoSuchAircraftException extends ErrorResponseException {

    @Serial
    private static final long serialVersionUID = 1L;

    public NoSuchAircraftException(Long aircraftId) {
        super(
                HttpStatus.NOT_FOUND,
                ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "No such aircraft: " + aircraftId),
                null);
    }
}
