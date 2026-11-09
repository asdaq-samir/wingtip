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

    /** The newest reports first, for the developer's reading. */
    List<Diagnostic> findTop200ByReceivedAtAfterOrderByReceivedAtDesc(Instant since);

    @Modifying
    @Transactional
    @Query("DELETE FROM Diagnostic d WHERE d.receivedAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}
