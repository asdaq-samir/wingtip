package app.wingtipmaps.gateway.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.service.Mailer;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

/** One message for a check's alerts, to the alert addresses or else the developers'. */
class AlertMailTest {

    private static final Instant T0 = Instant.parse("2026-11-09T14:03:00Z");

    private static Outages.Change down(String name) {
        return new Outages.Change(name, true, "ConnectException", T0, T0.plusSeconds(300));
    }

    @Test
    void aChecksAlertsGoAsOneMessageToTheAlertAddresses() {
        JavaMailSender sender = mock(JavaMailSender.class);
        new AlertMail(new Mailer(sender, "no-reply@wingtipmaps.app"), "ops@example.com", "dev@example.com")
                .say(List.of(down("planner"), down("feed FNS (NOTAMs)")));
        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(sent.capture());
        assertThat(sent.getValue().getTo()).containsExactly("ops@example.com");
        assertThat(sent.getValue().getSubject()).isEqualTo("Wingtip: 2 down");
        assertThat(sent.getValue().getText())
                .contains("DOWN planner since 14:03Z 9 Nov (5 min): ConnectException")
                .contains("DOWN feed FNS (NOTAMs)");
    }

    @Test
    void withNoAlertAddressesTheDevelopersHearOfIt() {
        JavaMailSender sender = mock(JavaMailSender.class);
        new AlertMail(new Mailer(sender, "no-reply@wingtipmaps.app"), "", "dev@example.com")
                .say(List.of(down("planner")));
        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(sent.capture());
        assertThat(sent.getValue().getTo()).containsExactly("dev@example.com");
        assertThat(sent.getValue().getSubject()).isEqualTo("Wingtip: planner down");
    }

    @Test
    void nothingChangedSendsNothing() {
        JavaMailSender sender = mock(JavaMailSender.class);
        new AlertMail(new Mailer(sender, "no-reply@wingtipmaps.app"), "ops@example.com", "").say(List.of());
        verify(sender, never()).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
    }

    @Test
    void theSubjectCountsWhatBeganAndWhatEnded() {
        Outages.Change back = new Outages.Change("weather service", false, "answering", T0, T0.plusSeconds(900));
        assertThat(AlertMail.subject(List.of(down("planner"), back))).isEqualTo("Wingtip: 1 down, 1 back");
        assertThat(AlertMail.line(back)).isEqualTo("BACK weather service since 14:03Z 9 Nov (15 min): answering");
    }
}
