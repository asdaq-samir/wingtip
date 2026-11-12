package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import app.wingtipmaps.gateway.planner.model.PlannerStudioDraft;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import tools.jackson.databind.json.JsonMapper;

/** A ready crash draft is mailed to the developers once, with its link in
 *  the Studio, and the planner told; a planner that does not answer is no drafts. */
class CrashDraftMailTest {

    private static final String DRAFTS =
            "[{\"id\":\"3f2a9c1b7d4e\",\"status\":\"ready\",\"aircraft\":\"Kitfox Supersport\","
                    + "\"city\":\"Estero\",\"state\":\"FL\",\"local_date\":\"2026-11-08\",\"track\":\"none\",\"sources\":[]}]";

    @Test
    void eachReadyDraftIsMailedWithItsLinkAndMarked() {
        PlannerClient planner = mock(PlannerClient.class);
        when(planner.draftsToNotice())
                .thenReturn(List.of(JsonMapper.shared().readValue(DRAFTS, PlannerStudioDraft[].class)));
        JavaMailSender sender = mock(JavaMailSender.class);
        CrashDraftMail drafts = new CrashDraftMail(
                planner, new Mailer(sender, "no-reply@wingtipmaps.app"), "dev@example.com", "https://wingtip.test/");
        SimpleMailMessage message = drafts.message(drafts.ready().getFirst());
        assertThat(message.getTo()).containsExactly("dev@example.com");
        assertThat(message.getSubject())
                .isEqualTo("Wingtip Studio: draft ready, Kitfox Supersport, Estero, FL, 2026-11-08");
        assertThat(message.getText())
                .contains("https://wingtip.test/app/studio?draft=3f2a9c1b7d4e")
                .contains("No ADS-B track")
                .contains("Preliminary");
        drafts.everyFewMinutes();
        verify(sender).send(any(SimpleMailMessage.class));
        verify(planner).noticed("3f2a9c1b7d4e");
    }

    @Test
    void withNoDeveloperAddressNothingIsAsked() {
        PlannerClient planner = mock(PlannerClient.class);
        JavaMailSender sender = mock(JavaMailSender.class);
        new CrashDraftMail(planner, new Mailer(sender, "no-reply@wingtipmaps.app"), "", "").everyFewMinutes();
        verifyNoInteractions(planner);
        verify(sender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void aPlannerThatDoesNotAnswerIsNoDrafts() {
        PlannerClient planner = mock(PlannerClient.class);
        when(planner.draftsToNotice())
                .thenThrow(new PlannerUnavailableException("the planner could not be reached for the crash drafts"));
        CrashDraftMail drafts =
                new CrashDraftMail(planner, new Mailer(mock(JavaMailSender.class), "x@y"), "dev@example.com", "");
        assertThat(drafts.ready()).isEmpty();
    }
}
