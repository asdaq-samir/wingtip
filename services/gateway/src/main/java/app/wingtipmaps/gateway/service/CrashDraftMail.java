package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.planner.model.PlannerStudioDraft;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The developer told by mail when a Studio crash draft is ready
 * (docs/STUDIO-PIPELINE.md): the crash-leads job, which keeps its own
 * schedule, has checked its identity and made its kit, and it waits in the
 * Studio's Drafts for a person. The mail is this app's whole part: every
 * few minutes the planner is asked which ready drafts nobody has been
 * mailed about (its internal GET /api/studio/drafts-to-notice, which no
 * browser reaches, through {@link PlannerClient} into the generated
 * StudioDraft), one message goes to the developers' addresses
 * ({@code app.developer-emails}) for each, with a link to it in the Studio,
 * and the planner is told it was sent. A draft is never published from
 * here: the mail says what is ready, a person decides.
 */
@Component
public class CrashDraftMail {

    private static final Logger log = LoggerFactory.getLogger(CrashDraftMail.class);

    private final PlannerClient planner;
    private final Mailer mail;
    private final Set<String> to;
    private final String studioUrl;

    public CrashDraftMail(
            PlannerClient planner,
            Mailer mail,
            @Value("${app.developer-emails:}") String developerEmails,
            @Value("${app.public-base-url:}") String publicBaseUrl) {
        this.planner = planner;
        this.mail = mail;
        this.to = Typed.addresses(developerEmails);
        this.studioUrl = publicBaseUrl.replaceAll("/+$", "") + "/app/studio";
    }

    /** One look, its mail sent. Off where app.studio.drafts-cron is "-". */
    @Scheduled(cron = "${app.studio.drafts-cron:0 */5 * * * *}", zone = "UTC")
    public void everyFewMinutes() {
        if (to.isEmpty()) {
            return;
        }
        for (PlannerStudioDraft draft : ready()) {
            try {
                mail.send(message(draft));
            } catch (MailException e) {
                log.warn("crash draft {} not mailed: {}", draft.getId(), e.getMessage());
                continue;
            }
            noticed(draft.getId());
        }
    }

    /** The ready drafts nobody has been mailed about; none where the planner does not say. */
    List<PlannerStudioDraft> ready() {
        try {
            return List.of(planner.get("/api/studio/drafts-to-notice", PlannerStudioDraft[].class, "the crash drafts"));
        } catch (PlannerUnavailableException e) {
            log.info("the planner's crash drafts not read: {}", e.getMessage());
            return List.of();
        }
    }

    /** "Wingtip Studio: draft ready, Kitfox Supersport, Estero, FL, 2026-11-08". */
    SimpleMailMessage message(PlannerStudioDraft draft) {
        String aircraft = or(draft.getAircraft(), "Aircraft");
        String place = or(draft.getCity(), "") + ", " + or(draft.getState(), "");
        String day = or(draft.getLocalDate(), "");
        boolean tracked = "adsb".equals(String.valueOf(draft.getTrack()));
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to.toArray(String[]::new));
        message.setSubject("Wingtip Studio: draft ready, " + aircraft + ", " + place + ", " + day);
        message.setText(
                "A crash draft is ready in the Studio: " + aircraft + ", " + place + ", " + day + " (local).\n\n"
                        + (tracked
                                ? "Its identity is confirmed: the report's N-number, the FAA registry's Mode S code and the ADS-B track agree.\n"
                                : "No ADS-B track: a draft of the place alone.\n")
                        + "Preliminary information, subject to change.\n\n"
                        + "Open it: " + studioUrl + "?draft=" + draft.getId() + "\n\n"
                        + "Nothing is published until you publish it, and not before the hold after a fatal event "
                        + "(docs/STUDIO-PIPELINE.md).\n");
        return message;
    }

    private static String or(String value, String otherwise) {
        return value == null ? otherwise : value;
    }

    private void noticed(String id) {
        try {
            planner.post("/api/studio/drafts/" + id + "/noticed", "", "the crash draft's notice");
        } catch (PlannerUnavailableException e) {
            log.warn("crash draft {} mailed, not marked: {}", id, e.getMessage());
        }
    }
}
