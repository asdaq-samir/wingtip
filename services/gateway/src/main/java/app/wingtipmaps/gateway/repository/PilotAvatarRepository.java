package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.PilotAvatar;
import org.springframework.data.jpa.repository.JpaRepository;

/** The pilots' avatar photos, keyed by the pilot. */
public interface PilotAvatarRepository extends JpaRepository<PilotAvatar, Long> {}
