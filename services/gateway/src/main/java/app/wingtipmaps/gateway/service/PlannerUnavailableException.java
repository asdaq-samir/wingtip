package app.wingtipmaps.gateway.service;

import java.io.Serial;

/** The planner did not answer, or not with what was asked for
 *  (PlannerClient's asks; GlobalExceptionHandler answers it). */
public class PlannerUnavailableException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public PlannerUnavailableException(String why) {
        super(why);
    }

    public PlannerUnavailableException(String why, Throwable cause) {
        super(why, cause);
    }
}
