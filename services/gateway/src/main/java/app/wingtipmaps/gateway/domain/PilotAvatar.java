package app.wingtipmaps.gateway.domain;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;

/**
 * The pilot's own photo for their avatar (V45): one a pilot, keyed by
 * them, its bytes as the app sent them once scaled down. A new photo
 * replaces the row's bytes and moves {@link #updatedAt}, the version in
 * the address the app shows it from.
 */
@Entity
@Table(name = "pilot_avatars")
@Getter
public class PilotAvatar {

    @Id
    private Long pilotId;

    @Column(nullable = false, length = 16)
    private String contentType;

    @Basic(fetch = FetchType.LAZY)
    @Column(nullable = false)
    private byte[] image;

    @Column(nullable = false)
    private Instant updatedAt;

    protected PilotAvatar() {
        // JPA
    }

    public PilotAvatar(Long pilotId, String contentType, byte[] image) {
        this.pilotId = pilotId;
        this.contentType = contentType;
        this.image = image.clone();
        this.updatedAt = Instant.now();
    }

    /** Another photo in this one's place. */
    public void replace(String contentType, byte[] image) {
        this.contentType = contentType;
        this.image = image.clone();
        this.updatedAt = Instant.now();
    }

    public byte[] getImage() {
        return image.clone();
    }
}
