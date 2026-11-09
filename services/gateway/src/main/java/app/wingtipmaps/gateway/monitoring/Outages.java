package app.wingtipmaps.gateway.monitoring;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Which of the watched things has been down, since when, and which of
 * those have been down long enough to say so: one minute's blip (a
 * restart, a deploy) is not news, an outage that lasts {@code after} is.
 * An alert is said once as it begins and once as it ends, however many
 * checks it lasts, and nothing is said of a blip that ended before it
 * became one.
 */
final class Outages {

    /** An alert begun ({@code down}) or ended, with what the last check
     *  saw and since when the thing has been down. */
    record Change(String name, boolean down, String detail, Instant since, Instant at) {}

    private final Duration after;
    private final Map<String, Instant> downSince = new HashMap<>();
    private final Set<String> alerting = new HashSet<>();

    Outages(Duration after) {
        this.after = after;
    }

    /** One check of {@code name}: up or not, and what was seen. The
     *  alert begun or ended by it, if any. */
    synchronized Optional<Change> see(String name, boolean up, String detail, Instant now) {
        if (up) {
            Instant since = downSince.remove(name);
            return alerting.remove(name) ? Optional.of(new Change(name, false, detail, since, now)) : Optional.empty();
        }
        Instant since = downSince.computeIfAbsent(name, n -> now);
        if (!alerting.contains(name) && !now.isBefore(since.plus(after))) {
            alerting.add(name);
            return Optional.of(new Change(name, true, detail, since, now));
        }
        return Optional.empty();
    }

    /** Whether {@code name} is alerting now. */
    synchronized boolean alerting(String name) {
        return alerting.contains(name);
    }
}
