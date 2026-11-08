package com.northflyers.wingtip.repository;

import com.northflyers.wingtip.domain.AircraftDueItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** An airplane's due items, scoped to the airplane, which the service
 *  finds by its pilot first. */
public interface AircraftDueItemRepository extends JpaRepository<AircraftDueItem, Long> {

    List<AircraftDueItem> findByAircraftIdOrderByIdAsc(Long aircraftId);

    Optional<AircraftDueItem> findByIdAndAircraftId(Long id, Long aircraftId);
}
