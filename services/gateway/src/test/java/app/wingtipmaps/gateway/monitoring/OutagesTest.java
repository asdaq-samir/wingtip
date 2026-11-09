package app.wingtipmaps.gateway.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** A blip is not news; an outage is said once as it begins and once as it ends. */
class OutagesTest {

    private static final Instant T0 = Instant.parse("2026-11-09T14:00:00Z");
    private final Outages outages = new Outages(Duration.ofMinutes(5));

    @Test
    void aBlipShorterThanTheWaitSaysNothing() {
        assertThat(outages.see("planner", false, "refused", T0)).isEmpty();
        assertThat(outages.see("planner", false, "refused", T0.plusSeconds(240)))
                .isEmpty();
        assertThat(outages.see("planner", true, "answering", T0.plusSeconds(300)))
                .isEmpty();
        assertThat(outages.alerting("planner")).isFalse();
    }

    @Test
    void anOutageIsSaidOnceWhenItLastsAndOnceWhenItEnds() {
        outages.see("planner", false, "refused", T0);
        Outages.Change began =
                outages.see("planner", false, "refused", T0.plusSeconds(300)).orElseThrow();
        assertThat(began.down()).isTrue();
        assertThat(began.since()).isEqualTo(T0);
        assertThat(outages.see("planner", false, "refused", T0.plusSeconds(360)))
                .isEmpty();
        Outages.Change ended =
                outages.see("planner", true, "answering", T0.plusSeconds(720)).orElseThrow();
        assertThat(ended.down()).isFalse();
        assertThat(ended.since()).isEqualTo(T0);
        assertThat(outages.see("planner", true, "answering", T0.plusSeconds(780)))
                .isEmpty();
    }

    @Test
    void withNoWaitTheFirstDownCheckIsTheAlert() {
        Outages feeds = new Outages(Duration.ZERO);
        assertThat(feeds.see("feed FNS", false, "no message for 45 min", T0)).isPresent();
    }
}
