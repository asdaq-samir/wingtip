package app.wingtipmaps.gateway.monitoring;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.planner.model.PlannerFeedHealth;
import app.wingtipmaps.gateway.planner.model.PlannerFeedState;
import app.wingtipmaps.gateway.service.SubscriptionService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * The launch's monitor, each minute: whether the planner, the assistant,
 * the weather service and this gateway (its readiness: the app and its
 * database) answer, and whether a live feed has gone stale -- and an
 * alert by mail (AlertMail) when one stays down {@code app.monitoring.down-after}
 * (five minutes), and again when it is back.
 *
 * <p>The feeds are the planner's to judge (app.feeds.watch, from
 * wingtip.feed_health: SWIM's NOTAMs, radar and flight data, the weather
 * service's METARs, TAFs, NEXRAD and GOES frames and the rest, the FAA's
 * chart and data cycles), each against its own cadence; it marks a feed
 * {@code alerting} once it has been stale FEED_ALERT_AFTER_MIN (15), and
 * this mails it as that begins and ends. The feeds are not asked of a
 * planner that is down: that is its own alert.
 *
 * <p>This gateway can only see its own database fail, not itself stop;
 * the host's own check (Docker's health check, the load balancer's) is
 * what sees that (docs/OPERATIONS.md). No aviation is read or worked out
 * here.
 */
@Service
public class UptimeWatch {

    private static final Logger log = LoggerFactory.getLogger(UptimeWatch.class);

    private final HealthProbe probe;
    private final AlertMail alerts;
    /** Boot's own, which ignores a field the planner adds later; its
     *  answers are generated from its document (the pom's planner-models). */
    private final JsonMapper json;

    private final String plannerBaseUrl;
    /** Each service watched, by name, and where its health is asked. */
    private final Map<String, String> services = new LinkedHashMap<>();

    private final Outages down;
    /** The planner has already waited out a feed's stale minutes. */
    private final Outages feeds = new Outages(Duration.ZERO);

    @Autowired
    public UptimeWatch(
            HealthProbe probe, AlertMail alerts, JsonMapper json, AppProperties app, ServerProperties server) {
        this(
                probe,
                alerts,
                json,
                app.planner().baseUrl(),
                app.assistant().baseUrl(),
                app.claudeFeatures(),
                app.monitoring().weatherUrl(),
                server.getPort(),
                app.monitoring().downAfter());
    }

    public UptimeWatch(
            HealthProbe probe,
            AlertMail alerts,
            JsonMapper json,
            String plannerBaseUrl,
            String assistantBaseUrl,
            SubscriptionService.ClaudeFeatures claude,
            String weatherUrl,
            int port,
            Duration downAfter) {
        this.probe = probe;
        this.alerts = alerts;
        this.json = json;
        this.plannerBaseUrl = trim(plannerBaseUrl);
        this.down = new Outages(downAfter);
        services.put("planner", this.plannerBaseUrl + "/");
        // The assistant only runs with the Claude features on (off by
        // default since the owner's decision of 2026-11-10,
        // docs/decisions/0035): off, it is not started, and not missed.
        if (claude != SubscriptionService.ClaudeFeatures.OFF) {
            services.put("assistant", trim(assistantBaseUrl) + "/");
        }
        if (StringUtils.hasText(weatherUrl)) {
            services.put("weather service", trim(weatherUrl) + "/");
        }
        services.put("gateway database", "http://localhost:" + port + "/actuator/health/readiness");
    }

    /** One minute's check, its alerts said. Off where app.monitoring.cron is "-". */
    @Scheduled(cron = "${app.monitoring.cron:30 * * * * *}", zone = "UTC")
    public void everyMinute() {
        alerts.say(check(Instant.now()));
    }

    /** Every service and feed looked at {@code now}; the alerts begun or ended. */
    List<Outages.Change> check(Instant now) {
        List<Outages.Change> changes = new ArrayList<>();
        boolean plannerUp = true;
        for (Map.Entry<String, String> service : services.entrySet()) {
            HealthProbe.Answer answer = probe.get(service.getValue());
            boolean up = answer.ok();
            if (service.getKey().equals("planner")) {
                plannerUp = up;
            }
            String detail = up ? "answering" : answer.status() == 0 ? answer.body() : "HTTP " + answer.status();
            down.see(service.getKey(), up, detail, now).ifPresent(changes::add);
        }
        if (plannerUp) {
            for (PlannerFeedState feed : feedStates()) {
                String name = "feed " + feed.getName() + " (" + feed.getWhat() + ")";
                feeds.see(name, !Boolean.TRUE.equals(feed.getAlerting()), feed.getDetail(), now)
                        .ifPresent(changes::add);
            }
        }
        return changes;
    }

    /** The planner's feeds as it last checked them; none where it does not say. */
    private List<PlannerFeedState> feedStates() {
        HealthProbe.Answer answer = probe.get(plannerBaseUrl + "/api/status/feeds");
        if (!answer.ok()) {
            log.warn(
                    "the planner's feeds not read: {}",
                    answer.status() == 0 ? answer.body() : "HTTP " + answer.status());
            return List.of();
        }
        try {
            List<PlannerFeedState> states =
                    json.readValue(answer.body(), PlannerFeedHealth.class).getFeeds();
            return states == null ? List.of() : states;
        } catch (JacksonException e) {
            log.warn("the planner's feeds not read: {}", e.getOriginalMessage());
            return List.of();
        }
    }

    private static String trim(String url) {
        return url.replaceAll("/+$", "");
    }
}
