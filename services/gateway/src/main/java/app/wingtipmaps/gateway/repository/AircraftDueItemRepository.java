package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.AircraftDueItem;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** An airplane's due items, scoped to the airplane, which the service
 *  finds by its pilot first. */
public interface AircraftDueItemRepository extends JpaRepository<AircraftDueItem, Long> {

    /** Several airplanes' items at once, in the order kept: one query for
     *  a pilot's list of airplanes and their paperwork, not one each. */
    List<AircraftDueItem> findByAircraftIdInOrderByIdAsc(Collection<Long> aircraftIds);

    Optional<AircraftDueItem> findByIdAndAircraftId(Long id, Long aircraftId);
}
