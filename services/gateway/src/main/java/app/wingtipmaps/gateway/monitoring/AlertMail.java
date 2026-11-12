package app.wingtipmaps.gateway.monitoring;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.service.Mailer;
import app.wingtipmaps.gateway.service.Typed;
import java.time.Duration;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.stereotype.Component;

/**
 * The monitor's alerts said to the people who run the app, by the mail the
 * app already sends (Mailer: Mailpit locally, the deployment's MAIL_HOST
 * in production): one message for every alert a check began or ended, so
 * an outage that takes the planner and its feeds down at once is one
 * email, not ten. To {@code app.monitoring.alert-emails}, or the
 * developers' addresses ({@code app.developer-emails}) where none are
 * given. Every alert is written to the log as well, mail or none.
 */
@Component
public class AlertMail {

    private static final Logger log = LoggerFactory.getLogger(AlertMail.class);
    private static final DateTimeFormatter ZULU =
            DateTimeFormatter.ofPattern("HH:mm'Z' d MMM").withZone(ZoneOffset.UTC);

    private final Mailer mail;
    private final Set<String> to;

    @Autowired
    public AlertMail(Mailer mail, AppProperties app) {
        this(mail, app.monitoring().alertEmails(), app.developerEmails());
    }

    public AlertMail(Mailer mail, String alertEmails, String developerEmails) {
        this.mail = mail;
        Set<String> given = Typed.addresses(alertEmails);
        this.to = given.isEmpty() ? Typed.addresses(developerEmails) : given;
    }

    /** The alerts of one check, logged and mailed together. */
    public void say(List<Outages.Change> changes) {
        if (changes.isEmpty()) {
            return;
        }
        for (Outages.Change c : changes) {
            if (c.down()) {
                log.warn("ALERT {}", line(c));
            } else {
                log.info("RECOVERED {}", line(c));
            }
        }
        if (to.isEmpty()) {
            log.warn("monitoring alert not mailed: no app.monitoring.alert-emails or app.developer-emails");
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to.toArray(String[]::new));
        message.setSubject(subject(changes));
        message.setText(body(changes));
        try {
            mail.send(message);
        } catch (MailException e) {
            log.warn("monitoring alert not mailed: {}", e.getMessage());
        }
    }

    /** "Wingtip: planner down", or how many alerts began and ended. */
    static String subject(List<Outages.Change> changes) {
        if (changes.size() == 1) {
            Outages.Change c = changes.getFirst();
            return "Wingtip: " + c.name() + (c.down() ? " down" : " back");
        }
        long down = changes.stream().filter(Outages.Change::down).count();
        long back = changes.size() - down;
        return "Wingtip: " + (down > 0 ? down + " down" : "") + (down > 0 && back > 0 ? ", " : "")
                + (back > 0 ? back + " back" : "");
    }

    /** One line an alert, then where to look. */
    static String body(List<Outages.Change> changes) {
        StringBuilder text = new StringBuilder();
        for (Outages.Change c : changes) {
            text.append(line(c)).append("\n\n");
        }
        text.append("Checked each minute by the gateway's UptimeWatch (docs/OPERATIONS.md). ")
                .append("The developer console's Status shows every feed; the gateway's log has each check.\n");
        return text.toString();
    }

    /** "DOWN planner since 14:03Z 9 Nov (5 min): ConnectException". */
    static String line(Outages.Change c) {
        String since = c.since() == null ? "" : " since " + ZULU.format(c.since());
        String lasted = c.since() == null ? "" : " (" + minutes(Duration.between(c.since(), c.at())) + ")";
        return (c.down() ? "DOWN " : "BACK ")
                + c.name()
                + since
                + lasted
                + (c.detail() == null ? "" : ": " + c.detail());
    }

    private static String minutes(Duration d) {
        long min = d.toMinutes();
        return min < 120 ? min + " min" : (min / 60) + " h " + (min % 60) + " min";
    }
}
