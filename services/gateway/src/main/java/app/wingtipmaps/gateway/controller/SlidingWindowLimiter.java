package app.wingtipmaps.gateway.controller;

import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.util.matcher.InetAddressMatcher;
import org.springframework.security.util.matcher.InetAddressMatchers;

/**
 * How many times a key has asked within a sliding window, and whether
 * one more fits: the magic-link throttle and the paid calls' daily
 * allowance both count this way, and each kept its own copy before.
 *
 * <p>In memory, so a restart forgets what it counted. That is the right
 * trade for a limit that only has to hold back a burst or a runaway day,
 * not account for every call.
 *
 * <p>Kept by hand rather than Bucket4j, which isn't a dependency, since a token bucket refills and counts differently from the sliding window SlidingWindowLimiterTest and MagicLinkThrottleTest pin.
 */
public final class SlidingWindowLimiter {

    /** The proxies whose X-Forwarded-For is believed, as addresses or
     *  CIDR blocks, from GATEWAY_TRUSTED_PROXIES (comma-separated); loopback
     *  only where it is unset. A deployment behind a proxy names the
     *  proxy's network (infra/docker-compose.prod.yml); a gateway facing a
     *  LAN directly (the phone mode) names none, so a LAN client's own
     *  header cannot change who it is counted as. */
    private static volatile InetAddressMatcher trusted = parse(System.getenv("GATEWAY_TRUSTED_PROXIES"));

    private final Duration window;
    private final Map<String, Deque<Instant>> recent = new ConcurrentHashMap<>();

    public SlidingWindowLimiter(Duration window) {
        this.window = window;
    }

    /** Whether one more request for `key` fits within the window, and if
     *  so, count it. */
    public boolean allow(String key, int limit, Instant now) {
        Instant since = now.minus(window);
        if (recent.size() > 10_000) {
            // Forget keys with nothing in the window, so a spray of one-off
            // callers cannot grow this without bound.
            recent.values().removeIf(times -> {
                synchronized (times) {
                    return times.isEmpty() || times.peekLast().isBefore(since);
                }
            });
        }
        Deque<Instant> times = recent.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (times) {
            while (!times.isEmpty() && times.peekFirst().isBefore(since)) {
                times.pollFirst();
            }
            if (times.size() >= limit) {
                return false;
            }
            times.addLast(now);
            return true;
        }
    }

    /** Spring Security's own matcher of addresses and CIDR blocks. */
    static InetAddressMatcher parse(String configured) {
        List<String> proxies = configured == null || configured.isBlank()
                ? List.of("127.0.0.0/8", "::1/128")
                : List.of(configured.trim().split("\\s*,\\s*"));
        return InetAddressMatchers.builder().includeAddresses(proxies).build();
    }

    /** For tests: who is trusted from now on (null: the default). */
    static void trustProxies(String configured) {
        trusted = parse(configured);
    }

    /** Whether `address` is one of the trusted proxies (an address or a
     *  CIDR block such as 172.16.0.0/12). */
    static boolean isTrustedProxy(String address) {
        try {
            return trusted.matches(address);
        } catch (IllegalArgumentException notAnAddress) {
            // A name that is no address is no proxy.
            return false;
        }
    }

    /** The key a request is counted under: whoever is signed in, or the
     *  address it came from where nobody is. */
    static String callerOf(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken)) {
            return "user:" + authentication.getName();
        }
        return "client:" + clientOf(request);
    }

    /**
     * Who is asking, for the per-client limit: the last X-Forwarded-For
     * entry -- the one the load balancer in front of this app appended,
     * the address it was connected from -- or, with no proxy in front,
     * the connection's own address. Read from the request as the
     * container received it: {@code forward-headers-strategy: framework}
     * makes {@code getRemoteAddr()} the <em>first</em> entry, which the
     * caller writes, and hides the header. Keyed on that, a caller could
     * dodge the limit with a new X-Forwarded-For on every request (seen:
     * 25 in a row accepted against a limit of 20). With no proxy in front
     * the caller can still write the last entry too; but mail is only
     * ever sent from a deployment behind the load balancer.
     *
     * <p>The header is read only where the connection came from a trusted
     * proxy ({@link #isTrustedProxy}); from anyone else it is ignored and
     * the connection's own address is the client, so a phone-mode LAN
     * client cannot rotate it to dodge a limit.
     */
    public static String clientOf(HttpServletRequest request) {
        ServletRequest received = request;
        while (received instanceof ServletRequestWrapper wrapper) {
            received = wrapper.getRequest();
        }
        String forwarded = received instanceof HttpServletRequest http ? http.getHeader("X-Forwarded-For") : null;
        if (forwarded != null && !forwarded.isBlank() && isTrustedProxy(received.getRemoteAddr())) {
            String[] hops = forwarded.split(",");
            return hops[hops.length - 1].trim();
        }
        return received.getRemoteAddr();
    }
}
