package app.wingtipmaps.gateway.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/** X-Forwarded-For is believed only from a configured proxy: the phone
 *  mode's gateway faces the LAN, where a client writes the header. */
class SlidingWindowLimiterTest {

    @AfterEach
    void defaults() {
        SlidingWindowLimiter.trustProxies(null);
    }

    private static MockHttpServletRequest from(String remote, String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remote);
        request.addHeader("X-Forwarded-For", forwardedFor);
        return request;
    }

    @Test
    void aLanClientsOwnHeaderIsIgnoredWhereNoProxyIsConfigured() {
        assertEquals("192.168.1.50", SlidingWindowLimiter.clientOf(from("192.168.1.50", "203.0.113.9")));
    }

    @Test
    void theLastHopIsBelievedFromAConfiguredProxyBlock() {
        SlidingWindowLimiter.trustProxies("10.0.0.0/8, 172.16.0.0/12");
        assertEquals("203.0.113.9", SlidingWindowLimiter.clientOf(from("172.18.0.4", "1.1.1.1, 203.0.113.9")));
        assertEquals("10.0.1.5", SlidingWindowLimiter.clientOf(from("10.0.1.5", "")));
        assertEquals("198.51.100.2", SlidingWindowLimiter.clientOf(from("198.51.100.2", "203.0.113.9")));
    }

    @Test
    void theKeysPastTheWindowAreLetGoAtMostOnceAMinuteNotOnEveryRequest() {
        SlidingWindowLimiter limiter = new SlidingWindowLimiter(Duration.ofSeconds(10));
        Instant start = Instant.parse("2026-11-21T12:00:00Z");
        for (int i = 0; i <= SlidingWindowLimiter.MOST_KEYS + 1; i++) {
            limiter.allow("caller-" + i, 5, start);
        }
        // Every key now past its window, but the last scan was just now.
        limiter.allow("late", 5, start.plusSeconds(30));
        assertEquals(SlidingWindowLimiter.MOST_KEYS + 3, limiter.keys());
        limiter.allow("later", 5, start.plus(SlidingWindowLimiter.PRUNE_EVERY));
        assertTrue(limiter.keys() <= 3, "the old keys let go: " + limiter.keys());
    }
}
