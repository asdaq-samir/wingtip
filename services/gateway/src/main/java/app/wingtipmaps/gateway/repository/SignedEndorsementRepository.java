package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.SignedEndorsement;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Persistence for {@link SignedEndorsement}. */
public interface SignedEndorsementRepository extends JpaRepository<SignedEndorsement, Long> {

    /** A student's, newest first. */
    List<SignedEndorsement> findByStudentIdOrderBySignedAtDesc(Long studentId);

    /** What an instructor signed since a moment, newest first: their
     *  record (14 CFR 61.189(b)). */
    List<SignedEndorsement> findByInstructorIdAndSignedAtAfterOrderBySignedAtDesc(Long instructorId, Instant after);

    /** The FAA registry records other instructors have signed as, verified:
     *  a record is one account's (the engine's instructor_verification
     *  refuses a second), so a student's second account cannot sign as an
     *  instructor already here. */
    @Query("SELECT DISTINCT e.instructorRegistryId FROM SignedEndorsement e WHERE e.instructorVerified"
            + " AND e.instructorRegistryId IS NOT NULL AND e.instructor.id <> :instructorId")
    List<String> registryIdsSignedByOthers(@Param("instructorId") Long instructorId);
}
