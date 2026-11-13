package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.wingtipmaps.gateway.domain.PaidFeature;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.Subscription;
import app.wingtipmaps.gateway.dto.SubscriptionDto;
import app.wingtipmaps.gateway.dto.SubscriptionDto.State;
import app.wingtipmaps.gateway.repository.SubscriptionRepository;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import app.wingtipmaps.gateway.security.SignInOptions;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.security.core.Authentication;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The one entitlement to the paid features, against a real database: free,
 * the free month started once and run out, paid for and run out, given --
 * refused with 401 or 402 as each is.
 */
@SpringBootTest(properties = "app.developer-emails=dev@example.com")
@Testcontainers
class SubscriptionServiceTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    /** A clock the test moves. */
    static final class Moving extends Clock {
        Instant now = Instant.parse("2026-10-11T12:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Autowired
    private SubscriptionRepository repository;

    @Autowired
    private PilotService pilots;

    private final Moving clock = new Moving();

    private SubscriptionService service(SignInOptions.Access access, String comped) {
        return new SubscriptionService(
                repository, pilots, new SignInOptions(List.of("email"), access), clock, 30, comped);
    }

    private SubscriptionService service() {
        return service(SignInOptions.Access.SIGN_IN, "instructor@example.com");
    }

    /** A new pilot, signed in by the emailed link. */
    private static Authentication someone() {
        return new MagicLinkAuthenticationToken(UUID.randomUUID() + "@example.com");
    }

    private Pilot pilotOf(Authentication who) {
        return pilots.current(who).orElseThrow();
    }

    @Test
    void aNewPilotHasNoneAndIsOfferedTheFreeMonth() {
        Authentication who = someone();
        SubscriptionDto status = service().status(pilotOf(who));
        assertThat(status.state()).isEqualTo(State.FREE);
        assertThat(status.entitled()).isFalse();
        assertThat(status.trialAvailable()).isTrue();
        assertThat(status.trialDays()).isEqualTo(30);

        Optional<SubscriptionService.Refusal> refused = service().refusal(who, PaidFeature.DEBRIEF);
        assertThat(refused).hasValueSatisfying(r -> {
            assertThat(r.status()).isEqualTo(402);
            assertThat(r.detail()).isEqualTo("The debrief comes with the subscription, its first month free.");
        });
    }

    @Test
    void theFreeMonthIsOnceAnAccountAndRunsOutAfterThirtyDays() {
        Authentication who = someone();
        Pilot pilot = pilotOf(who);
        SubscriptionDto started = service().startTrial(pilot);
        assertThat(started.state()).isEqualTo(State.TRIAL);
        assertThat(started.entitled()).isTrue();
        assertThat(started.trialAvailable()).isFalse();
        assertThat(started.until()).isEqualTo(Instant.parse("2026-11-10T12:00:00Z"));
        assertThat(service().refusal(who, PaidFeature.DEBRIEF)).isEmpty();
        assertThatThrownBy(() -> service().startTrial(pilot))
                .isInstanceOf(SubscriptionService.TrialUsedException.class);

        clock.now = clock.now.plus(Duration.ofDays(31));
        SubscriptionDto ended = service().status(pilot);
        assertThat(ended.state()).isEqualTo(State.FREE);
        assertThat(ended.trialAvailable()).isFalse();
        assertThat(service().refusal(who, PaidFeature.DEBRIEF)).hasValueSatisfying(r -> {
            assertThat(r.status()).isEqualTo(402);
            assertThat(r.detail())
                    .isEqualTo("The debrief comes with the subscription. Your free month ended on 10 November.");
        });
        // Still once an account, long after.
        assertThatThrownBy(() -> service().startTrial(pilot))
                .isInstanceOf(SubscriptionService.TrialUsedException.class);
    }

    @Test
    void paidTimeIsTheirsUntilItRunsOut() {
        Authentication who = someone();
        Pilot pilot = pilotOf(who);
        service()
                .paid(
                        pilot,
                        Instant.parse("2027-10-11T12:00:00Z"),
                        Subscription.Plan.YEARLY,
                        Subscription.Store.APP_STORE,
                        "2000000123456789");
        SubscriptionDto paid = service().status(pilot);
        assertThat(paid.state()).isEqualTo(State.SUBSCRIBED);
        assertThat(paid.plan()).isEqualTo(Subscription.Plan.YEARLY);
        assertThat(paid.store()).isEqualTo(Subscription.Store.APP_STORE);
        assertThat(paid.until()).isEqualTo(Instant.parse("2027-10-11T12:00:00Z"));
        assertThat(paid.trialAvailable()).isFalse();
        assertThat(service().refusal(who, PaidFeature.DEBRIEF)).isEmpty();

        clock.now = Instant.parse("2027-10-12T00:00:00Z");
        SubscriptionDto lapsed = service().status(pilot);
        assertThat(lapsed.state()).isEqualTo(State.FREE);
        // The free month is a new subscriber's, as a store's introductory offer is.
        assertThat(lapsed.trialAvailable()).isFalse();
        assertThat(service().refusal(who, PaidFeature.DEBRIEF)).hasValueSatisfying(r -> {
            assertThat(r.status()).isEqualTo(402);
            assertThat(r.detail()).isEqualTo("The debrief comes with the subscription. Yours ended on 11 October.");
        });
    }

    @Test
    void anInstructorAndADeveloperAreGivenIt() {
        Authentication instructor = new MagicLinkAuthenticationToken("Instructor@Example.com");
        SubscriptionDto given = service().status(pilotOf(instructor));
        assertThat(given.state()).isEqualTo(State.COMPED);
        assertThat(given.entitled()).isTrue();
        assertThat(given.until()).isNull();
        assertThat(service().refusal(instructor, PaidFeature.DEBRIEF)).isEmpty();

        Authentication developer = new MagicLinkAuthenticationToken("dev@example.com");
        assertThat(service().refusal(developer, PaidFeature.DEBRIEF)).isEmpty();
        assertThat(service().status(pilotOf(developer)).state()).isEqualTo(State.COMPED);
    }

    @Test
    void signedOutIsA401AndAMachineOfOnesOwnHasItAll() {
        assertThat(service().refusal(null, PaidFeature.DEBRIEF)).hasValueSatisfying(r -> {
            assertThat(r.status()).isEqualTo(401);
            assertThat(r.detail()).isEqualTo("Sign in for the debrief.");
        });
        assertThat(service(SignInOptions.Access.OPEN, "").refusal(null, PaidFeature.DEBRIEF))
                .isEmpty();
    }

    @Test
    void with_no_subscription_sold_the_debrief_is_every_signed_in_pilots() {
        SubscriptionService service = new SubscriptionService(
                repository,
                pilots,
                new SignInOptions(List.of("email"), SignInOptions.Access.SIGN_IN),
                clock,
                30,
                "",
                false);
        assertThat(service.refusal(someone(), PaidFeature.DEBRIEF)).isEmpty();
        assertThat(service.refusal(null, PaidFeature.DEBRIEF))
                .map(SubscriptionService.Refusal::status)
                .contains(401);
        assertThat(service.sold()).isFalse();
    }
}
