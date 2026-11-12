package app.wingtipmaps.gateway.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.service.SubscriptionService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Each service by its health answer, each feed by the planner's alerting, the feeds not asked of a planner down. */
class UptimeWatchTest {

    private static final Instant T0 = Instant.parse("2026-11-09T14:00:00Z");

    /** Answers by address; what was asked, in order. */
    private static final class Fake extends HealthProbe {
        final Map<String, Answer> answers = new HashMap<>();
        final List<String> asked = new ArrayList<>();

        @Override
        public Answer get(String url) {
            asked.add(url);
            return answers.getOrDefault(url, new Answer(200, "{}"));
        }
    }

    private static UptimeWatch watch(Fake probe) {
        return watch(probe, SubscriptionService.ClaudeFeatures.EVERYONE);
    }

    private static UptimeWatch watch(Fake probe, SubscriptionService.ClaudeFeatures claude) {
        return new UptimeWatch(
                probe,
                null,
                JsonMapper.builder()
                        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                        .build(),
                "http://planner:8000/",
                "http://assistant:8000",
                claude,
                "http://weather:8000",
                8080,
                Duration.ofMinutes(5));
    }

    private static final String FEEDS = """
            {"checked_at": "2026-11-09T14:00:00Z", "alert_after_min": 15, "feeds": [
              {"name": "FNS", "kind": "swim", "what": "NOTAMs", "state": "stale",
               "detail": "no message for 45 min (stale after 30 min)", "alerting": true},
              {"name": "metars", "kind": "weather", "what": "weather", "state": "ok", "alerting": false}]}
            """;

    @Test
    void aServiceDownFiveMinutesIsAnAlertAndAFeedThePlannerCallsAlertingAtOnce() {
        Fake probe = new Fake();
        probe.answers.put("http://weather:8000/", new HealthProbe.Answer(0, "ConnectException"));
        probe.answers.put("http://planner:8000/api/status/feeds", new HealthProbe.Answer(200, FEEDS));
        UptimeWatch watch = watch(probe);

        List<Outages.Change> first = watch.check(T0);
        assertThat(first).extracting(Outages.Change::name).containsExactly("feed FNS (NOTAMs)");

        List<Outages.Change> later = watch.check(T0.plusSeconds(300));
        assertThat(later).extracting(Outages.Change::name).containsExactly("weather service");
        assertThat(later.getFirst().detail()).isEqualTo("ConnectException");
        assertThat(probe.asked).contains("http://assistant:8000/", "http://localhost:8080/actuator/health/readiness");
    }

    @Test
    void theFeedsAreNotAskedOfAPlannerThatIsDown() {
        Fake probe = new Fake();
        probe.answers.put("http://planner:8000/", new HealthProbe.Answer(503, ""));
        watch(probe).check(T0);
        assertThat(probe.asked).doesNotContain("http://planner:8000/api/status/feeds");
    }

    /** Off, the default, the assistant is not started (docs/decisions/0035),
     *  so it is not asked after nor missed. */
    @Test
    void withTheClaudeFeaturesOffTheAssistantIsNotWatched() {
        Fake probe = new Fake();
        watch(probe, SubscriptionService.ClaudeFeatures.OFF).check(Instant.parse("2026-11-10T14:00:00Z"));
        assertThat(probe.asked).doesNotContain("http://assistant:8000/").contains("http://planner:8000/");
    }
}
