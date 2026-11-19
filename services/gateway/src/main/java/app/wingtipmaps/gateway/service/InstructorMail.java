package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.stereotype.Component;

/**
 * The emails between a student and their instructor -- an ask, a review,
 * a signature, a lesson set -- each ending with the app's address where
 * the deployment has one. One that cannot be sent is logged and the rest
 * goes on, the app holding everything it says.
 */
@Component
public class InstructorMail {

    private static final Logger log = LoggerFactory.getLogger(InstructorMail.class);

    private final Mailer mail;
    private final String publicBaseUrl;

    public InstructorMail(Mailer mail, AppProperties app) {
        this.mail = mail;
        this.publicBaseUrl = app.publicBaseUrl().replaceAll("/+$", "");
    }

    /** The app's address on a line of its own, "" where there is none. */
    String openLine() {
        return publicBaseUrl.isBlank() ? "" : "\n\n" + publicBaseUrl + "/";
    }

    void send(String to, String subject, String body) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to);
        message.setSubject("Wingtip Maps: " + subject);
        message.setText(body);
        try {
            mail.send(message);
        } catch (RuntimeException failed) {
            log.warn("Instructor email not sent: {}", failed.getClass().getSimpleName());
        }
    }
}
