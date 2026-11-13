package app.wingtipmaps.gateway.service;

import java.io.Serial;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** A request of the instructor flow refused (InstructorService,
 *  LessonService), with the status and the words to answer it with, as
 *  a problem (ResponseEntityExceptionHandler). */
public class InstructorRefusedException extends ErrorResponseException {

    @Serial
    private static final long serialVersionUID = 1L;

    public InstructorRefusedException(HttpStatus status, String why) {
        super(status, ProblemDetail.forStatusAndDetail(status, why), null);
    }
}
