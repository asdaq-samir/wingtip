package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.Squawk;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** An airplane's squawks, scoped to the airplane, which the service finds
 *  by its pilot first. */
public interface SquawkRepository extends JpaRepository<Squawk, Long> {

    List<Squawk> findByAircraftIdOrderByReportedOnDescIdDesc(Long aircraftId);

    /** The open squawks of several airplanes at once, newest first: a
     *  pilot's list of airplanes reads them in one query, not one each. */
    List<Squawk> findByAircraftIdInAndFixedOnIsNullOrderByReportedOnDescIdDesc(Collection<Long> aircraftIds);

    Optional<Squawk> findByIdAndAircraftId(Long id, Long aircraftId);
}
