package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.Flight;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link Flight}, scoped to the pilot who filed it. */
public interface FlightRepository extends JpaRepository<Flight, Long> {

    /** Fetches {@code aircraft} eagerly -- {@link app.wingtipmaps.gateway.controller.FlightController}
     *  reads every flight's tail number to build its summary list, which
     *  otherwise issues one extra query per flight for a LAZY association. */
    @EntityGraph(attributePaths = "aircraft")
    List<Flight> findByPilotIdOrderByCreatedAtDesc(Long pilotId);

    /** Scoped by pilot for the same reason as {@code AircraftRepository}:
     *  a flight is private to the person who planned it. Its aircraft
     *  fetched with it, as the list's are: the answer reads the tail
     *  number after the transaction has closed (open-in-view is off), so
     *  a flight with an airplane failed to read (found by the export's
     *  test, AccountDeletionTest). Its nav log named too: a fetch graph
     *  makes lazy whatever it leaves out, the eager checkpoints included. */
    @EntityGraph(attributePaths = {"aircraft", "checkpoints"})
    Optional<Flight> findByIdAndPilotId(Long id, Long pilotId);
}
