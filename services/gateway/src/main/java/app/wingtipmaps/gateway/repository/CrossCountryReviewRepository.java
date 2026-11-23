package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.CrossCountryReview;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link CrossCountryReview}. */
public interface CrossCountryReviewRepository extends JpaRepository<CrossCountryReview, Long> {

    /** A student's, newest first. */
    List<CrossCountryReview> findByStudentIdOrderByAskedAtDesc(Long studentId);

    /** The ones put to an instructor and not yet answered, oldest first,
     *  with what the instructor's page reads of each: the student, the
     *  instructor, the flight and its airplane, and the endorsement. */
    @EntityGraph(attributePaths = {"student", "instructor", "flight", "flight.aircraft", "endorsement"})
    List<CrossCountryReview> findByInstructorIdAndAnsweredAtIsNullOrderByAskedAt(Long instructorId);

    /** Whether a flight was put to an instructor at all, answered or not. */
    boolean existsByFlightId(Long flightId);

    /** Between one student and one instructor, newest first. */
    List<CrossCountryReview> findByStudentIdAndInstructorIdOrderByAskedAtDesc(Long studentId, Long instructorId);
}
