package app.wingtipmaps.gateway.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;

/**
 * A saved flight shared by link: read-only, to whoever has the link,
 * until its pilot stops sharing it (the row deleted). One a flight, keyed
 * by it; shared again after a stop, it gets a new token, so the old link
 * stays dead.
 *
 * <p>The token is the only key a reader has: 128 random bits, as
 * URL-safe base64, too many to guess. What a reader sees is
 * {@link app.wingtipmaps.gateway.dto.SharedFlightDto}: the plan and its
 * nav log, never the pilot's name, address or notes, and the airplane's
 * N-number only where the pilot said to include it ({@link #includeTail}).
 */
@Entity
@Table(name = "flight_shares")
@Getter
public class FlightShare {

    @Id
    private Long flightId;

    @Column(nullable = false, unique = true, length = 32)
    private String token;

    /** The airplane's N-number shown with it, at the pilot's choice; off
     *  unless they turn it on. */
    @Column(nullable = false)
    private boolean includeTail;

    @Column(nullable = false)
    private Instant sharedAt;

    protected FlightShare() {
        // JPA
    }

    public FlightShare(Long flightId, String token, boolean includeTail) {
        this.flightId = flightId;
        this.token = token;
        this.includeTail = includeTail;
        this.sharedAt = Instant.now();
    }

    /** The N-number shown or not, as the pilot changes it on a share
     *  already sent; the link stays the same. */
    public FlightShare withTail(boolean include) {
        this.includeTail = include;
        return this;
    }
}
