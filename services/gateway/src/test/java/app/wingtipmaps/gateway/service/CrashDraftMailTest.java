package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import app.wingtipmaps.gateway.monitoring.HealthProbe;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

/** A ready crash draft is mailed to the developers once, with its link in the Studio. */
class CrashDraftMailTest {

    private static final String DRAFTS =
            "[{\"id\":\"3f2a9c1b7d4e\",\"status\":\"ready\",\"aircraft\":\"Kitfox Supersport\","
                    + "\"city\":\"Estero\",\"state\":\"FL\",\"local_date\":\"2026-11-08\",\"track\":\"none\",\"sources\":[]}]";

    @Test
    void eachReadyDraftIsMailedWithItsLink() {
        HealthProbe probe = mock(HealthProbe.class);
        when(probe.get("http://planner:8000/api/studio/drafts-to-notice"))
                .thenReturn(new HealthProbe.Answer(200, DRAFTS));
        JavaMailSender sender = mock(JavaMailSender.class);
        CrashDraftMail drafts = new CrashDraftMail(
                probe,
                new Mailer(sender, "no-reply@wingtipmaps.app"),
                "dev@example.com",
                "http://planner:8000/",
                "https://wingtip.test/");
        SimpleMailMessage message = drafts.message(drafts.ready().getFirst());
        assertThat(message.getTo()).containsExactly("dev@example.com");
        assertThat(message.getSubject())
                .isEqualTo("Wingtip Studio: draft ready, Kitfox Supersport, Estero, FL, 2026-11-08");
        assertThat(message.getText())
                .contains("https://wingtip.test/app/studio?draft=3f2a9c1b7d4e")
                .contains("No ADS-B track")
                .contains("Preliminary");
    }

    @Test
    void withNoDeveloperAddressNothingIsAsked() {
        HealthProbe probe = mock(HealthProbe.class);
        JavaMailSender sender = mock(JavaMailSender.class);
        new CrashDraftMail(probe, new Mailer(sender, "no-reply@wingtipmaps.app"), "", "http://planner:8000", "")
                .everyFewMinutes();
        verify(probe, never()).get(any());
        verify(sender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void aPlannerThatDoesNotAnswerIsNoDrafts() {
        HealthProbe probe = mock(HealthProbe.class);
        when(probe.get(any())).thenReturn(new HealthProbe.Answer(0, "ConnectException"));
        CrashDraftMail drafts = new CrashDraftMail(
                probe, new Mailer(mock(JavaMailSender.class), "x@y"), "dev@example.com", "http://planner:8000", "");
        assertThat(drafts.ready()).isEmpty();
        ArgumentCaptor<String> asked = ArgumentCaptor.forClass(String.class);
        verify(probe).get(asked.capture());
        assertThat(asked.getValue()).endsWith("/api/studio/drafts-to-notice");
    }
}
