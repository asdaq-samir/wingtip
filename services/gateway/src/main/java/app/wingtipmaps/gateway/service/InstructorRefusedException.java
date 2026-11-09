package app.wingtipmaps.gateway.service;

import java.io.Serial;
import org.springframework.http.HttpStatus;

/** A request of the instructor flow refused (InstructorService,
 *  LessonService), with the status and the words to answer it with. */
public class InstructorRefusedException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    public final HttpStatus status;

    public InstructorRefusedException(HttpStatus status, String why) {
        super(why);
        this.status = status;
    }
}
