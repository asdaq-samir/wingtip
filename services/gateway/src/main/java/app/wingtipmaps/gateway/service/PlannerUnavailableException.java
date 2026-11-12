package app.wingtipmaps.gateway.service;

import java.io.Serial;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** The planner did not answer, or not with what was asked for
 *  (PlannerClient's asks): a 502 problem, the status the proxy answers
 *  for a planner that does not answer, so the page reports both alike. */
public class PlannerUnavailableException extends ErrorResponseException {

    @Serial
    private static final long serialVersionUID = 1L;

    public PlannerUnavailableException(String why) {
        this(why, null);
    }

    public PlannerUnavailableException(String why, Throwable cause) {
        super(HttpStatus.BAD_GATEWAY, ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, why), cause);
    }
}
