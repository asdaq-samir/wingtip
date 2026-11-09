package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.FlightShare;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** The saved flights shared by link, keyed by the flight. */
public interface FlightShareRepository extends JpaRepository<FlightShare, Long> {

    Optional<FlightShare> findByToken(String token);

    /** The shares among a list of flights: the saved-flights list's, in one query. */
    List<FlightShare> findByFlightIdIn(Collection<Long> flightIds);
}
