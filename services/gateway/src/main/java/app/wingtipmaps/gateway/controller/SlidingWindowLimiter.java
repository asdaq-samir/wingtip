package app.wingtipmaps.gateway.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

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

    /** How often the keys with nothing in the window are let go, at most,
     *  once there are over MOST_KEYS: past that every allow() scanned the
     *  whole map, and while every key was recent the scan let none go, so
     *  the next call scanned it all again (10,000 checks a request on the
     *  open speed and diagnostics endpoints under a spray of addresses). */
    static final Duration PRUNE_EVERY = Duration.ofMinutes(1);

    static final int MOST_KEYS = 10_000;

    private final Duration window;
    private final Map<String, Deque<Instant>> recent = new ConcurrentHashMap<>();
    private final AtomicReference<Instant> prunedAt = new AtomicReference<>(Instant.MIN);

    public SlidingWindowLimiter(Duration window) {
        this.window = window;
    }

    /** Whether one more request for `key` fits within the window, and if
     *  so, count it. */
    public boolean allow(String key, int limit, Instant now) {
        Instant since = now.minus(window);
        Instant pruned = prunedAt.get();
        if (recent.size() > MOST_KEYS
                && !now.isBefore(pruned.plus(PRUNE_EVERY))
                && prunedAt.compareAndSet(pruned, now)) {
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

    /** For tests: how many keys are held. */
    int keys() {
        return recent.size();
    }

    /**
     * Who is asking, for the per-client limits: the connection's address,
     * an IPv6 caller by its /64.
     *
     * <p>{@code getRemoteAddr()} is the caller here, not a header it
     * wrote: Tomcat's RemoteIpValve ({@code forward-headers-strategy:
     * native}) puts X-Forwarded-For's address in its place only where the
     * connection came from a trusted proxy ({@code
     * server.tomcat.remoteip.internal-proxies}, GATEWAY_TRUSTED_PROXIES;
     * loopback alone where unset), so a phone-mode LAN client cannot
     * rotate the header to dodge a limit. This class once walked the header by
     * hand.
     *
     * <p>An IPv6 caller is counted by its /64, the block one subscriber
     * line or one cloud host is given: keyed per address, one /64 held
     * 2^64 callers, and 30 asks from as many addresses -- the lockout the
     * limits are set against -- took 30 requests.
     */
    public static String clientOf(HttpServletRequest request) {
        return keyOf(request.getRemoteAddr());
    }

    /** An address as the limits count it: IPv4 as it is, IPv6 by its /64. */
    static String keyOf(String address) {
        if (address == null || address.indexOf(':') < 0) {
            return String.valueOf(address);
        }
        try {
            // ofLiteral parses without a DNS lookup, and gives an IPv4
            // address for an IPv4-mapped one (::ffff:192.0.2.1).
            InetAddress parsed = InetAddress.ofLiteral(address);
            if (!(parsed instanceof Inet6Address)) {
                return parsed.getHostAddress();
            }
            byte[] network = Arrays.copyOf(parsed.getAddress(), 16);
            Arrays.fill(network, 8, 16, (byte) 0);
            return InetAddress.getByAddress(network).getHostAddress() + "/64";
        } catch (IllegalArgumentException | UnknownHostException notAnAddress) {
            return address;
        }
    }

    /**
     * An emailed link asked for an address by a caller, counted as the
     * sign-in and deletion links both are: per caller, per address from
     * that caller, and per address from everyone at `addressCallers`
     * times that. The caller is counted first, so a caller already
     * refused spends no address's count; and a stranger spends only their
     * own share of an address, so locking its pilot out takes that many
     * callers.
     */
    public boolean allowLink(
            String address, String client, int perClient, int perAddress, int addressCallers, Instant now) {
        return allow("client:" + client, perClient, now)
                && allow(address + " from " + client, perAddress, now)
                && allow(address, perAddress * addressCallers, now);
    }
}
