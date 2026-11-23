package app.wingtipmaps.gateway.security.mcp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

/**
 * ConnectorGrants#live's yes for one access token, kept a short while: the planner asks before
 * every MCP tool call, dozens a chat, and each ask read the pilot's
 * connections and parsed each one's whole row (waste-server audit D).
 *
 * <p>Only a live answer is kept, and never past {@link #KEPT} nor past the
 * moment the token runs out, so a token that
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

    /** One access token of a pilot's through one client: the pilot's id as
     *  the principal's name, the client's id, and the token's SHA-256 (the
     *  token itself is not held), so a yes for one token is never a yes
     *  for another (the deep security review of 2026-11-21). */
    private record Key(String principal, String clientId, String token) {

        static Key of(long pilotId, String clientId, String accessToken) {
            try {
                byte[] digest =
                        MessageDigest.getInstance("SHA-256").digest(accessToken.getBytes(StandardCharsets.UTF_8));
                return new Key(Long.toString(pilotId), clientId, HexFormat.of().formatHex(digest));
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("every JVM has SHA-256", e);
            }
        }
    }

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

    /** Whether a live answer is kept for this token, still in time. */
    boolean isLive(long pilotId, String clientId, String accessToken) {
        Key key = Key.of(pilotId, clientId, accessToken);
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
     *  {@code seen}, kept until {@code firstExpiry} (the token's own
     *  expiry; null for none) or {@link #KEPT}, the sooner; not kept where
     *  a forget came in between. */
    void live(long pilotId, String clientId, String accessToken, Instant firstExpiry, long seen) {
        Instant now = clock.instant();
        Instant until = now.plus(KEPT);
        if (firstExpiry != null && firstExpiry.isBefore(until)) {
            until = firstExpiry;
        }
        if (liveUntil.size() > MANY) {
            liveUntil.values().removeIf(u -> !now.isBefore(u));
        }
        Key key = Key.of(pilotId, clientId, accessToken);
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
