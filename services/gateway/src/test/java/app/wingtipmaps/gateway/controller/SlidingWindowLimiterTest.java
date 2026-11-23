package app.wingtipmaps.gateway.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/** Who a caller is counted as, and the window itself. Which address
 *  Tomcat hands over (X-Forwarded-For from a trusted proxy alone) is
 *  RemoteIpTest's. */
class SlidingWindowLimiterTest {

    private static MockHttpServletRequest from(String remote) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remote);
        request.addHeader("X-Forwarded-For", "203.0.113.9");
        return request;
    }

    @Test
    void theCallerIsTheConnectionsAddress_neverAHeaderItWrote() {
        assertEquals("192.168.1.50", SlidingWindowLimiter.clientOf(from("192.168.1.50")));
    }

    /** Round 4's security review, M1: one /64 is 2^64 addresses. */
    @Test
    void anIpv6CallerIsCountedByItsSlash64() {
        String one = SlidingWindowLimiter.clientOf(from("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
        String other = SlidingWindowLimiter.clientOf(from("2001:0db8:0001:0002:0:0:0:1"));
        assertEquals("2001:db8:1:2:0:0:0:0/64", one);
        assertEquals(one, other);
        assertNotEquals(one, SlidingWindowLimiter.clientOf(from("2001:db8:1:3::1")));
        // An IPv4 caller as it is, mapped into IPv6 or not.
        assertEquals("192.0.2.1", SlidingWindowLimiter.clientOf(from("::ffff:192.0.2.1")));
        assertEquals("192.0.2.1", SlidingWindowLimiter.clientOf(from("192.0.2.1")));
    }

    @Test
    void anIpv6SprayFromOneSlash64IsOneCaller() {
        SlidingWindowLimiter limiter = new SlidingWindowLimiter(Duration.ofHours(1));
        Instant now = Instant.parse("2026-11-23T12:00:00Z");
        for (int i = 0; i < 20; i++) {
            assertTrue(limiter.allow(
                    SlidingWindowLimiter.clientOf(from("2001:db8::" + Integer.toHexString(i + 1))), 20, now));
        }
        assertFalse(limiter.allow(SlidingWindowLimiter.clientOf(from("2001:db8::ffff")), 20, now));
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
