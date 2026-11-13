package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.FlightWatch;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.BriefingChangeDto;
import app.wingtipmaps.gateway.dto.BriefingSourceDto;
import app.wingtipmaps.gateway.dto.FlightWatchDto;
import app.wingtipmaps.gateway.repository.FlightRepository;
import app.wingtipmaps.gateway.repository.FlightWatchRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.service.ChangeLines.Changes;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * The flight watch: a pilot watches a saved flight, and up to its
 * departure this app re-briefs it on a schedule, asks the planner what
 * changed ({@link ChangeLines}), keeps the latest changes for the app to show
 * ({@link FlightWatchDto}) and emails the pilot when something did.
 *
 * <p>Nothing aviation is read or worked out here. The briefing is the
 * planner's document, kept as it came to be diffed against the next;
 * what changed is the planner's answer, carried to the app and the
 * email as it was given. A pilot's watch is theirs alone, scoped the
 * way {@link FlightService} scopes their flights.
 *
 */
@Service
public class FlightWatchService {

    private static final Logger log = LoggerFactory.getLogger(FlightWatchService.class);

    /** The window a watch is checked in: from two hours past departure
     *  back to 36 hours before it -- the night before and the morning of,
     *  as a pilot re-briefs. A flight more than two hours gone is left to
     *  expire: it cannot be re-briefed. */
    static final Duration AFTER_DEPARTURE = Duration.ofHours(2);

    static final Duration BEFORE_DEPARTURE = Duration.ofHours(36);
    /** No two checks of one watch closer than this, however the schedule
     *  fires: a briefing is weather fetched along the route. */
    static final Duration AGAIN_AFTER = Duration.ofMinutes(20);
    /** Watches a run checks at most, nearest departure first: each is two
     *  planner calls of tens of seconds, and the next run is half an hour
     *  after this one ends. */
    static final int MOST_A_RUN = 50;
    /** The most of one run's watches a single pilot's may take, so one
     *  pilot watching fifty flights cannot spend the whole run and delay
     *  everyone else's. */
    static final int MOST_A_PILOT_A_RUN = 5;

    private final FlightWatchRepository watches;
    private final FlightRepository flights;
    private final PilotRepository pilots;
    private final PlannerClient planner;
    private final ChangeLines lines;
    private final Mailer mail;
    /** Where the email's link into the app points (the magic link's and
     *  the instructor emails' app.public-base-url); blank where this
     *  deployment sends no mail, and then there is no link. */
    private final String publicBaseUrl;
    /** Boot's own, for the changes kept with a watch. */
    private final JsonMapper json;

    @Autowired
    public FlightWatchService(
            FlightWatchRepository watches,
            FlightRepository flights,
            PilotRepository pilots,
            PlannerClient planner,
            ChangeLines lines,
            AppProperties app,
            Mailer mail,
            JsonMapper json) {
        this(watches, flights, pilots, planner, lines, mail, app.publicBaseUrl(), json);
    }

    public FlightWatchService(
            FlightWatchRepository watches,
            FlightRepository flights,
            PilotRepository pilots,
            PlannerClient planner,
            ChangeLines lines,
            Mailer mail,
            String publicBaseUrl,
            JsonMapper json) {
        this.watches = watches;
        this.flights = flights;
        this.pilots = pilots;
        this.planner = planner;
        this.lines = lines;
        this.mail = mail;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
        this.json = json;
    }

    /**
     * Watches the pilot's flight up to {@code departAt}: the briefing now
     * is fetched and kept as the baseline, so the first check has
     * something to diff against. A flight watched already is watched
     * again from now. Empty where the flight is not theirs.
     *
     * @throws PlannerUnavailableException when the planner cannot brief it;
     *     nothing is kept then
     */
    public Optional<FlightWatchDto> watch(Pilot pilot, Long flightId, Instant departAt) {
        return flights.findByIdAndPilotId(flightId, pilot.getId()).map(flight -> {
            String briefing = briefingOf(flight, departAt);
            Instant now = Instant.now();
            FlightWatch watch = watches.findById(flight.getId())
                    .map(kept -> kept.rewatch(departAt, briefing))
                    .orElseGet(() -> new FlightWatch(flight.getId(), pilot.getId(), departAt, briefing, now));
            return dto(watches.save(watch));
        });
    }

    /** The pilot's watch on the flight, or empty where there is none or
     *  the flight is not theirs. */
    public Optional<FlightWatchDto> watchOf(Pilot pilot, Long flightId) {
        return watches.findByFlightIdAndPilotId(flightId, pilot.getId()).map(this::dto);
    }

    /** Ends the pilot's watch on the flight; false where there was none
     *  of theirs to end. */
    public boolean unwatch(Pilot pilot, Long flightId) {
        return watches.findByFlightIdAndPilotId(flightId, pilot.getId())
                .map(watch -> {
                    watches.delete(watch);
                    return true;
                })
                .orElse(false);
    }

    /** Every half hour (wingtip.watch.every), the watches due a check.
     *  The first run waits one interval, so a restart does not re-brief
     *  every watch at once; a check it delays is caught by the next. */
    @Scheduled(fixedDelayString = "${wingtip.watch.every:PT30M}", initialDelayString = "${wingtip.watch.every:PT30M}")
    public void check() {
        check(Instant.now());
    }

    /**
     * Checks the watches due at {@code now}: those departing within the
     * window and not checked in the last 20 minutes, at most 50, nearest
     * departure first. Watches of flights more than two hours gone are
     * deleted first. A planner failure is logged and that watch skipped
     * for the next run -- never deleted for an outage -- and the rest go
     * on.
     *
     * @return how many were found changed
     */
    public int check(Instant now) {
        int gone = watches.deleteDepartedBefore(now.minus(AFTER_DEPARTURE));
        if (gone > 0) {
            log.info("{} flight watch(es) past departure ended", gone);
        }
        List<FlightWatch> due = watches.due(
                now.minus(AFTER_DEPARTURE),
                now.plus(BEFORE_DEPARTURE),
                now.minus(AGAIN_AFTER),
                PageRequest.of(0, MOST_A_RUN * 4));
        // Nearest departure first, as the query orders them, but at most
        // MOST_A_PILOT_A_RUN of any one pilot's; the rest wait for the
        // next run, as those past MOST_A_RUN always did.
        Map<Long, Integer> perPilot = new HashMap<>();
        List<FlightWatch> taken = new ArrayList<>();
        for (FlightWatch watch : due) {
            if (taken.size() >= MOST_A_RUN) {
                break;
            }
            if (perPilot.merge(watch.getPilotId(), 1, Integer::sum) <= MOST_A_PILOT_A_RUN) {
                taken.add(watch);
            }
        }
        int changed = 0;
        for (FlightWatch watch : taken) {
            try {
                if (checkOne(watch, now)) {
                    changed++;
                }
            } catch (RuntimeException failed) {
                log.warn("Flight {}'s watch not checked; tried again next run", watch.getFlightId(), failed);
            }
        }
        return changed;
    }

    /** One watch's check: the briefing now against the kept one. True
     *  where something changed, and the pilot was told. */
    private boolean checkOne(FlightWatch watch, Instant now) {
        Flight flight = flights.findById(watch.getFlightId()).orElse(null);
        if (flight == null) {
            // The database cascades a deleted flight's watch; a watch read
            // between the two is simply left for it.
            return false;
        }
        String briefing = briefingOf(flight, watch.getDepartAt());
        Changes answer = lines.changes(
                flight.getDepartureIdent(),
                flight.getDestinationIdent(),
                flight.getStops(),
                watch.getBriefingJson(),
                briefing);
        if (!answer.changed()) {
            watches.save(watch.checked(now));
            return false;
        }
        watches.save(watch.changed(briefing, write(answer), now));
        // Kept before it is mailed: the app shows the change whatever the
        // mail does, and a mail that fails is logged, as the instructor
        // emails are.
        pilots.findById(watch.getPilotId()).ifPresent(pilot -> send(pilot, flight, answer));
        return true;
    }

    private String briefingOf(Flight flight, Instant departAt) {
        return planner.briefing(
                flight.getDepartureIdent(),
                flight.getDestinationIdent(),
                flight.getStops(),
                departAt,
                flight.getTotalEteMin());
    }

    private void send(Pilot pilot, Flight flight, Changes answer) {
        try {
            mail.send(message(pilot, flight, answer, publicBaseUrl));
        } catch (RuntimeException failed) {
            // The flight's id, not the pilot's address (docs/privacy-inventory.md, "Logs").
            log.warn(
                    "Flight {}'s changes not emailed: {}",
                    flight.getId(),
                    failed.getClass().getSimpleName());
        }
    }

    /** The email: what changed, a sentence a line, and where to read the
     *  briefing. The link opens the flight's route on the planner, as the
     *  app's own flight links do (web lib/flightLink). */
    static SimpleMailMessage message(Pilot pilot, Flight flight, Changes answer, String publicBaseUrl) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(pilot.getEmail());
        message.setSubject(
                "Your flight " + flight.getDepartureIdent() + " to " + flight.getDestinationIdent() + ": what changed");
        StringBuilder body = new StringBuilder();
        for (BriefingChangeDto sentence :
                answer.sentences() == null ? List.<BriefingChangeDto>of() : answer.sentences()) {
            body.append(sentence.text()).append('\n');
        }
        body.append("\nOpen the app to see the briefing.");
        if (!publicBaseUrl.isBlank()) {
            body.append('\n')
                    .append(publicBaseUrl)
                    .append("/app/plan?dep=")
                    .append(encode(flight.getDepartureIdent()))
                    .append("&dest=")
                    .append(encode(flight.getDestinationIdent()));
            if (!flight.getStops().isEmpty()) {
                body.append("&stops=").append(encode(String.join(",", flight.getStops())));
            }
        }
        message.setText(body.toString());
        return message;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private FlightWatchDto dto(FlightWatch watch) {
        // This app's own answer to the browser and the phones, copied out
        // of the planner's: its shape is this app's API, which outlives
        // a change to the planner's.
        Changes changes = read(watch);
        List<BriefingChangeDto> sentences = changes == null || changes.sentences() == null
                ? List.of()
                : changes.sentences().stream()
                        .map(c ->
                                new BriefingChangeDto(c.text(), c.sources() == null ? List.<String>of() : c.sources()))
                        .toList();
        List<BriefingSourceDto> sources = changes == null || changes.sources() == null ? List.of() : changes.sources();
        return new FlightWatchDto(
                watch.getFlightId(),
                watch.getDepartAt(),
                watch.getCheckedAt(),
                watch.getChangedAt(),
                sentences,
                sources);
    }

    private String write(Changes answer) {
        try {
            return json.writeValueAsString(answer);
        } catch (JacksonException e) {
            throw new IllegalStateException("The planner's changes would not write as JSON", e);
        }
    }

    private Changes read(FlightWatch watch) {
        if (watch.getChangesJson() == null) {
            return null;
        }
        try {
            // Kept as ChangeLines wrote it; a row kept before Claude was
            // taken out has the same fields and two more, read past.
            return json.readValue(watch.getChangesJson(), Changes.class);
        } catch (JacksonException e) {
            throw new IllegalStateException("Flight " + watch.getFlightId() + "'s kept changes are not JSON", e);
        }
    }
}
