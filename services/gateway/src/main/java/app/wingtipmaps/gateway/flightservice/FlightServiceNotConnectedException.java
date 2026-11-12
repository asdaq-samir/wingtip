package app.wingtipmaps.gateway.flightservice;

import java.io.Serial;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Asked to file or brief with no Flight Service provider connected: a
 *  503 problem that says where to file instead. */
public class FlightServiceNotConnectedException extends ErrorResponseException {

    @Serial
    private static final long serialVersionUID = 1L;

    public FlightServiceNotConnectedException() {
        super(
                HttpStatus.SERVICE_UNAVAILABLE,
                ProblemDetail.forStatusAndDetail(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "Filing and briefing through the app are not connected yet: file at 1800wxbrief.com, "
                                + "or call Flight Service at 1-800-WX-BRIEF"),
                null);
    }
}
