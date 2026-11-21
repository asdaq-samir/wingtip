package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.Diagnostic;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface DiagnosticRepository extends JpaRepository<Diagnostic, Long> {

    /** One build's faults of one kind: how many, and the newest. */
    interface VersionFaults {
        String getPlatform();

        String getVersion();

        String getKind();

        long getCount();

        /** The newest's arrival, ISO-8601 in UTC. */
        String getLastAt();
    }

    /** Each platform's builds' faults since {@code since}, by kind, the
     *  newest build first: the owner's status page (AppHealthController). */
    @Query(value = """
            SELECT platform, version, kind, count(*) AS count,
                   to_char(max(received_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastAt"
            FROM diagnostics
            WHERE received_at >= :since
            GROUP BY platform, version, kind
            ORDER BY max(received_at) DESC, platform, version, kind""", nativeQuery = true)
    List<VersionFaults> faultsByVersionSince(@Param("since") Instant since);

    /** The newest reports first, for the developer's reading. */
    List<Diagnostic> findTop200ByReceivedAtAfterOrderByReceivedAtDesc(Instant since);

    @Modifying
    @Transactional
    @Query("DELETE FROM Diagnostic d WHERE d.receivedAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}
