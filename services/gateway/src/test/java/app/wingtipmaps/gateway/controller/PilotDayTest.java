package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** The pilot's day is their zone's, not the server's UTC. */
class PilotDayTest {

    /** 19:30 CST on 21 November 2026 is 01:30 UTC on the 22nd. */
    private static final Clock EVENING = Clock.fixed(Instant.parse("2026-11-22T01:30:00Z"), ZoneOffset.UTC);

    @AfterEach
    void forget() {
        RequestContextHolder.resetRequestAttributes();
    }

    private static void asked(String zone) {
        var request = new MockHttpServletRequest();
        if (zone != null) {
            request.addHeader(PilotDay.HEADER, zone);
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    @Test
    void theEveningInChicagoIsStillTheTwentyFirst() {
        asked("America/Chicago");
        assertThat(PilotDay.today(EVENING)).isEqualTo(LocalDate.of(2026, 11, 21));
    }

    @Test
    void noZoneOrOneThatDoesNotReadIsUtcs() {
        asked(null);
        assertThat(PilotDay.today(EVENING)).isEqualTo(LocalDate.of(2026, 11, 22));
        asked("Mars/Olympus");
        assertThat(PilotDay.today(EVENING)).isEqualTo(LocalDate.of(2026, 11, 22));
        RequestContextHolder.resetRequestAttributes();
        assertThat(PilotDay.today(EVENING)).isEqualTo(LocalDate.of(2026, 11, 22));
    }
}
