package app.wingtipmaps.gateway.security.mcp;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

/**
 * ConnectorGrants#live's yes, kept a short while: the planner asks before
 * every MCP tool call, dozens a chat, and each ask read the pilot's
 * connections and parsed each one's whole row (waste-server audit D).
 *
 * <p>Only a live answer is kept, and never past {@link #KEPT} nor past the
 * first moment one of the connection's tokens runs out, so a token that
 * expires on its own is never taken as live after its own expiry. Every
 * change this app makes to a pilot's connections forgets the pilot's
 * answers at once: a token saved, rotated or revoked (/oauth2/revoke saves
 * it invalidated), a connection removed for a replayed refresh token
 * (RotatedRefreshTokens), and every connection ended with the account
 * (ConnectorGrants#forget). What {@link #KEPT} bounds is only a change made
 * to the tables behind this process's back -- by hand, or by a second
 * gateway, which the deployment does not run (docs/SECURITY.md).
 */
@Component
public class LiveConnections {

    /** How long a live answer is kept at most. */
    static final Duration KEPT = Duration.ofSeconds(60);

    /** A pilot's connections through one client, by the pilot's id as the
     *  principal's name and the client's id. */
    private record Key(String principal, String clientId) {}

    /** Beyond this many kept, the run-out ones are dropped as one is kept. */
    private static final int MANY = 10_000;

    private final Map<Key, Instant> liveUntil = new ConcurrentHashMap<>();
    /** Raised by every forget: an answer read from the tables while one
     *  happened is not kept, as it may be from before the change. */
    private final AtomicLong changes = new AtomicLong();
    private final Clock clock;

    public LiveConnections() {
        this(Clock.systemUTC());
    }

    LiveConnections(Clock clock) {
        this.clock = clock;
    }

    /** Whether a live answer is kept for the pilot and client, still in time. */
    boolean isLive(long pilotId, String clientId) {
        Key key = new Key(Long.toString(pilotId), clientId);
        Instant until = liveUntil.get(key);
        if (until == null) {
            return false;
        }
        if (!clock.instant().isBefore(until)) {
            liveUntil.remove(key, until);
            return false;
        }
        return true;
    }

    /** Taken before the tables are read, and handed to {@link #live}. */
    long changes() {
        return changes.get();
    }

    /** A live answer read from the tables after {@link #changes} gave
     *  {@code seen}, kept until {@code firstExpiry} (the first of the live
     *  tokens' expiries; null for none) or {@link #KEPT}, the sooner; not
     *  kept where a forget came in between. */
    void live(long pilotId, String clientId, Instant firstExpiry, long seen) {
        Instant now = clock.instant();
        Instant until = now.plus(KEPT);
        if (firstExpiry != null && firstExpiry.isBefore(until)) {
            until = firstExpiry;
        }
        if (liveUntil.size() > MANY) {
            liveUntil.values().removeIf(u -> !now.isBefore(u));
        }
        Key key = new Key(Long.toString(pilotId), clientId);
        liveUntil.put(key, until);
        if (changes.get() != seen) {
            liveUntil.remove(key, until);
        }
    }

    /** Every answer kept for the principal (the pilot's id) forgotten. */
    void forget(String principal) {
        changes.incrementAndGet();
        liveUntil.keySet().removeIf(k -> k.principal().equals(principal));
    }
}
