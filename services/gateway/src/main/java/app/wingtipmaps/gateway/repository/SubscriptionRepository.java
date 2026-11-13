package app.wingtipmaps.gateway.repository;

import app.wingtipmaps.gateway.domain.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link Subscription}. */
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {}
