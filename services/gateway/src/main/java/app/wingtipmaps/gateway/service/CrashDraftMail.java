package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.monitoring.HealthProbe;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The developer told by mail when a Studio crash draft is ready
 * (docs/STUDIO-PIPELINE.md): the crash-leads job has checked its identity
 * and made its kit, and it waits in the Studio's Drafts for a person. Every
 * few minutes the planner is asked which ready drafts nobody has been
 * mailed about (its internal GET /api/studio/drafts-to-notice, which no
 * browser reaches), one message goes to the developers' addresses
 * ({@code app.developer-emails}) for each, with a link to it in the Studio,
 * and the planner is told it was sent. A draft is never published from
 * here: the mail says what is ready, a person decides.
 */
@Component
public class CrashDraftMail {

    private static final Logger log = LoggerFactory.getLogger(CrashDraftMail.class);
    private static final ObjectMapper JSON = JsonMapper.builder().build();

    private final HealthProbe probe;
    private final Mailer mail;
    private final Set<String> to;
    private final String plannerBaseUrl;
    private final String studioUrl;
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public CrashDraftMail(
            HealthProbe probe,
            Mailer mail,
            @Value("${app.developer-emails:}") String developerEmails,
            @Value("${planner-service.base-url:http://planner:8000}") String plannerBaseUrl,
            @Value("${app.public-base-url:}") String publicBaseUrl) {
        this.probe = probe;
        this.mail = mail;
        this.to = Typed.addresses(developerEmails);
        this.plannerBaseUrl = plannerBaseUrl.replaceAll("/+$", "");
        this.studioUrl = publicBaseUrl.replaceAll("/+$", "") + "/app/studio";
    }

    /** One look, its mail sent. Off where app.studio.drafts-cron is "-". */
    @Scheduled(cron = "${app.studio.drafts-cron:0 */5 * * * *}", zone = "UTC")
    public void everyFewMinutes() {
        if (to.isEmpty()) {
            return;
        }
        for (JsonNode draft : ready()) {
            String id = text(draft, "id", "");
            if (id.isEmpty()) {
                continue;
            }
            try {
                mail.send(message(draft));
            } catch (MailException e) {
                log.warn("crash draft {} not mailed: {}", id, e.getMessage());
                continue;
            }
            noticed(id);
        }
    }

    /** The ready drafts nobody has been mailed about; none where the planner does not say. */
    List<JsonNode> ready() {
        HealthProbe.Answer answer = probe.get(plannerBaseUrl + "/api/studio/drafts-to-notice");
        if (answer.status() != 200) {
            return List.of();
        }
        try {
            List<JsonNode> out = new ArrayList<>();
            JSON.readTree(answer.body()).forEach(out::add);
            return out;
        } catch (JacksonException e) {
            log.warn("the planner's crash drafts not read: {}", e.getOriginalMessage());
            return List.of();
        }
    }

    /** "Wingtip Studio: draft ready, Kitfox Supersport, Estero, FL, 2026-11-08". */
    SimpleMailMessage message(JsonNode draft) {
        String id = text(draft, "id", "");
        String aircraft = text(draft, "aircraft", "Aircraft");
        String place = text(draft, "city", "") + ", " + text(draft, "state", "");
        String day = text(draft, "local_date", "");
        boolean tracked = "adsb".equals(text(draft, "track", ""));
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to.toArray(String[]::new));
        message.setSubject("Wingtip Studio: draft ready, " + aircraft + ", " + place + ", " + day);
        message.setText(
                "A crash draft is ready in the Studio: " + aircraft + ", " + place + ", " + day + " (local).\n\n"
                        + (tracked
                                ? "Its identity is confirmed: the report's N-number, the FAA registry's Mode S code and the ADS-B track agree.\n"
                                : "No ADS-B track: a draft of the place alone.\n")
                        + "Preliminary information, subject to change.\n\n"
                        + "Open it: " + studioUrl + "?draft=" + id + "\n\n"
                        + "Nothing is published until you publish it, and not before the hold after a fatal event "
                        + "(docs/STUDIO-PIPELINE.md).\n");
        return message;
    }

    /** A member's text, or {@code otherwise} where it is missing, null or not text. */
    private static String text(JsonNode node, String key, String otherwise) {
        JsonNode value = node.get(key);
        return value != null && value.isString() ? value.stringValue() : otherwise;
    }

    private void noticed(String id) {
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(plannerBaseUrl + "/api/studio/drafts/" + id + "/noticed"))
                .POST(HttpRequest.BodyPublishers.noBody())
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() != 200) {
                log.warn("crash draft {} mailed, not marked: HTTP {}", id, response.statusCode());
            }
        } catch (IOException e) {
            log.warn("crash draft {} mailed, not marked: {}", id, e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
