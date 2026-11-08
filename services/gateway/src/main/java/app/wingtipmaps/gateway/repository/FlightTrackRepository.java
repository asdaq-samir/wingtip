package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.FlightTrack;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FlightTrackRepository extends JpaRepository<FlightTrack, Long> {
}
