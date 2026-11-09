package app.wingtipmaps.gateway.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;

/**
 * One thing that went wrong on a device (V35): a crash, a hang, a forced
 * exit or an uncaught error, with the platform, the app's version, the
 * operating system, the kind of device, a one-line signature and the
 * scrubbed detail (DiagnosticText). Nothing that says whose device it was.
 */
@Entity
@Table(name = "diagnostics")
@Getter
public class Diagnostic {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Instant receivedAt;

    /** When the device says it happened, where it says. */
    private Instant occurredAt;

    @Column(nullable = false, length = 10)
    private String platform;

    @Column(nullable = false, length = 40)
    private String version;

    @Column(length = 40)
    private String os;

    @Column(nullable = false, length = 10)
    private String device;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(nullable = false, length = 200)
    private String signature;

    @Column(columnDefinition = "text")
    private String detail;

    protected Diagnostic() {
        // JPA
    }

    public Diagnostic(
            Instant receivedAt,
            Instant occurredAt,
            String platform,
            String version,
            String os,
            String device,
            String kind,
            String signature,
            String detail) {
        this.receivedAt = receivedAt;
        this.occurredAt = occurredAt;
        this.platform = platform;
        this.version = version;
        this.os = os;
        this.device = device;
        this.kind = kind;
        this.signature = signature;
        this.detail = detail;
    }
}
