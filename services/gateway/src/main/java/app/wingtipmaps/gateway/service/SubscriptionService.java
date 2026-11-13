package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.domain.PaidFeature;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.Subscription;
import app.wingtipmaps.gateway.dto.SubscriptionDto;
import app.wingtipmaps.gateway.dto.SubscriptionDto.State;
import app.wingtipmaps.gateway.repository.SubscriptionRepository;
import app.wingtipmaps.gateway.security.SignInOptions;
import java.io.Serial;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;

/**
 * The one entitlement to the paid features ({@link PaidFeature}), kept
 * here and checked here on every paid call: the page's own idea of it is
 * only for showing. The planner is asked only through this app
 * (PlannerProxyController: it publishes no port of its own), so a call
 * refused here never reaches it.
 *
 * <p>A pilot has the paid features while their free month runs (once an
 * account, started by them), while paid time runs (a store's or the
 * website's, recorded by {@link #paid}), or always when they are given
 * them: a developer, or an address {@code app.subscription.comped-emails}
 * lists (an instructor, a tester).
 *
 * <p>Where nobody can sign in and writes are open (app.open-writes: one's
 * own machine) there is no pilot to hold a subscription, and every paid
 * feature is open with the rest.
 *
 * <p>A deployment may sell no subscription at all ({@code
 * app.subscription.enabled} false), at the owner's ask for the proof of
 * concept ("no mention of it at all ... if it picks up, I will go that
 * route"): the debrief, which costs nothing a use, is then everyone's.
 */
@Service
public class SubscriptionService {

    /** Why a paid call was refused: the status and the pilot's sentence. */
    public record Refusal(int status, String detail) {}

    /** The trial is already started, or was once: once an account. A 409 problem. */
    public static class TrialUsedException extends ErrorResponseException {
        @Serial
        private static final long serialVersionUID = 1L;

        public TrialUsedException() {
            super(
                    HttpStatus.CONFLICT,
                    ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Your free month has already been used."),
                    null);
        }
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMMM", Locale.US);

    private final SubscriptionRepository subscriptions;
    private final PilotService pilots;
    private final SignInOptions signIn;
    private final Clock clock;
    private final int trialDays;
    private final Set<String> compedEmails;
    private final boolean sold;

    @Autowired
    public SubscriptionService(
            SubscriptionRepository subscriptions, PilotService pilots, SignInOptions signIn, AppProperties app) {
        this(
                subscriptions,
                pilots,
                signIn,
                Clock.systemUTC(),
                app.subscription().trialDays(),
                app.subscription().compedEmails(),
                app.subscription().enabled());
    }

    /** A deployment that sells the subscription, as the tests mostly ask about. */
    SubscriptionService(
            SubscriptionRepository subscriptions,
            PilotService pilots,
            SignInOptions signIn,
            Clock clock,
            int trialDays,
            String compedEmails) {
        this(subscriptions, pilots, signIn, clock, trialDays, compedEmails, true);
    }

    SubscriptionService(
            SubscriptionRepository subscriptions,
            PilotService pilots,
            SignInOptions signIn,
            Clock clock,
            int trialDays,
            String compedEmails,
            boolean sold) {
        this.subscriptions = subscriptions;
        this.pilots = pilots;
        this.signIn = signIn;
        this.clock = clock;
        this.trialDays = trialDays;
        this.compedEmails = Typed.addresses(compedEmails);
        this.sold = sold;
    }

    /** Whether this deployment sells the subscription at all: where not,
     *  the page says nothing of it (SignInCapabilitiesController). */
    public boolean sold() {
        return sold;
    }

    /** The pilot's subscription. */
    @Transactional(readOnly = true)
    public SubscriptionDto status(Pilot pilot) {
        Instant now = clock.instant();
        Optional<Subscription> held = subscriptions.findById(pilot.getId());
        State state = stateOf(pilot, held, now);
        Instant until = switch (state) {
            case SUBSCRIBED -> held.orElseThrow().getPaidUntil();
            case TRIAL -> held.orElseThrow().getTrialEndsAt();
            case FREE, COMPED -> null;
        };
        // Once an account, and for a pilot who has never paid: a store's
        // introductory offer is a new subscriber's too.
        boolean trialAvailable = held.map(s -> s.getTrialStartedAt() == null && s.getPaidUntil() == null)
                .orElse(true);
        boolean paid = state == State.SUBSCRIBED;
        return new SubscriptionDto(
                state,
                state != State.FREE,
                until,
                trialAvailable && state == State.FREE,
                trialDays,
                paid ? held.orElseThrow().getPlan() : null,
                paid ? held.orElseThrow().getStore() : null);
    }

    /** The free month, from now: once an account, whenever the pilot
     *  starts it. Refused once started, even long after it ended. */
    @Transactional
    public SubscriptionDto startTrial(Pilot pilot) {
        Instant now = clock.instant();
        Subscription held = subscriptions.findById(pilot.getId()).orElseGet(() -> new Subscription(pilot.getId(), now));
        if (held.getTrialStartedAt() != null) {
            throw new TrialUsedException();
        }
        held.startTrial(now, now.plus(Duration.ofDays(trialDays)));
        subscriptions.save(held);
        return status(pilot);
    }

    /** Paid time, as a store's server notification or a grant records it. */
    @Transactional
    public void paid(Pilot pilot, Instant until, Subscription.Plan plan, Subscription.Store store, String storeRef) {
        Instant now = clock.instant();
        Subscription held = subscriptions.findById(pilot.getId()).orElseGet(() -> new Subscription(pilot.getId(), now));
        held.paid(until, plan, store, storeRef, now);
        subscriptions.save(held);
    }

    /**
     * Whether the caller may use {@code feature} now: empty to go on, or
     * the refusal to answer with -- a 401 signed out, a 402 without the
     * subscription.
     */
    @Transactional
    public Optional<Refusal> refusal(Authentication authentication, PaidFeature feature) {
        if (signIn.access() == SignInOptions.Access.OPEN) {
            return Optional.empty();
        }
        Optional<Pilot> current = pilots.current(authentication);
        if (current.isEmpty()) {
            return Optional.of(new Refusal(401, "Sign in for " + feature.object() + "."));
        }
        if (!sold) {
            // No subscription here: the debrief is everyone's.
            return Optional.empty();
        }
        Pilot pilot = current.get();
        Optional<Subscription> held = subscriptions.findById(pilot.getId());
        if (stateOf(pilot, held, clock.instant()) == State.FREE) {
            return Optional.of(new Refusal(402, feature.comes() + " with the subscription" + whyFree(held)));
        }
        return Optional.empty();
    }

    private State stateOf(Pilot pilot, Optional<Subscription> held, Instant now) {
        if (pilot.getRole().isDeveloper()
                || compedEmails.contains(pilot.getEmail().toLowerCase(Locale.ROOT))) {
            return State.COMPED;
        }
        if (held.map(s -> s.getPaidUntil() != null && s.getPaidUntil().isAfter(now))
                .orElse(false)) {
            return State.SUBSCRIBED;
        }
        if (held.map(s -> s.getTrialEndsAt() != null && s.getTrialEndsAt().isAfter(now))
                .orElse(false)) {
            return State.TRIAL;
        }
        return State.FREE;
    }

    /** The rest of the 402's sentence: what ended, or the free month on offer. */
    private static String whyFree(Optional<Subscription> held) {
        Subscription s = held.orElse(null);
        if (s != null && s.getPaidUntil() != null) {
            return ". Yours ended on " + DAY.format(s.getPaidUntil().atZone(ZoneOffset.UTC)) + ".";
        }
        if (s != null && s.getTrialEndsAt() != null) {
            return ". Your free month ended on " + DAY.format(s.getTrialEndsAt().atZone(ZoneOffset.UTC)) + ".";
        }
        return ", its first month free.";
    }
}
