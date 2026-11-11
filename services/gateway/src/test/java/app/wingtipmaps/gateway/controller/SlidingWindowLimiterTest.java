package app.wingtipmaps.gateway.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
