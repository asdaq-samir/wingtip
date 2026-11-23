package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.FlightCheckpoint;
import app.wingtipmaps.gateway.domain.FlightTrack;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.SaveFlightCheckpointRequest;
import app.wingtipmaps.gateway.dto.SaveFlightRequest;
import app.wingtipmaps.gateway.dto.TrackDto;
import app.wingtipmaps.gateway.dto.TrackPointDto;
import app.wingtipmaps.gateway.dto.UpdateFlightRequest;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import app.wingtipmaps.gateway.repository.CrossCountryReviewRepository;
import app.wingtipmaps.gateway.repository.FlightRepository;
import app.wingtipmaps.gateway.repository.FlightTrackRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** A pilot's own flights -- their use of a route, the aircraft they
 *  flew it in, and the nav log they filed. Scoped by pilot the same
 *  way {@link AircraftService} is. */
@Service
public class FlightService {

    private static final TypeReference<List<TrackPointDto>> POINTS = new TypeReference<>() {};

    private final FlightRepository flights;
    private final AircraftRepository aircraft;
    private final FlightTrackRepository tracks;
    private final CrossCountryReviewRepository reviews;
    /** Boot's own, for a track's points kept as JSON. */
    private final JsonMapper json;

    public FlightService(
            FlightRepository flights,
            AircraftRepository aircraft,
            FlightTrackRepository tracks,
            CrossCountryReviewRepository reviews,
            JsonMapper json) {
        this.flights = flights;
        this.aircraft = aircraft;
        this.tracks = tracks;
        this.reviews = reviews;
        this.json = json;
    }

    public List<Flight> list(Pilot pilot) {
        return flights.findByPilotIdOrderByCreatedAtDesc(pilot.getId());
    }

    public Optional<Flight> get(Pilot pilot, Long id) {
        return flights.findByIdAndPilotId(id, pilot.getId());
    }

    /** Files a new flight and its nav log. The referenced aircraft (if
     *  any) must belong to this pilot -- looked up the same
     *  pilot-scoped way {@link #get} is. Naming an id that doesn't
     *  resolve throws rather than silently filing with no aircraft:
     *  a request naming an id explicitly is asserting it should
     *  attach, not offering a hint that can be dropped. */
    @Transactional
    public Flight save(Pilot pilot, SaveFlightRequest request) {
        Flight flight =
                new Flight(pilot, flownIn(pilot, request), request.departureIdent(), request.destinationIdent());
        return flights.save(filed(flight, request));
    }

    /** This pilot's saved flight planned again as `request` has it: its
     *  route, airplane, altitudes, picks, time and nav log, its name, notes
     *  and share kept (the connector's update_saved_flight); empty where
     *  the flight is not theirs. A 409 where the flight was put to an
     *  instructor for the solo cross-country review 14 CFR 61.93(c)(3)
     *  asks: the review and the endorsement that answers it show the
     *  flight's own row (CrossCountryReviewDto), so planning it again in
     *  place would put a route the instructor never reviewed under their
     *  signature (the security review of 2026-11-22, M1). The app never
     *  changes a saved flight's route; the connector saves a new one. */
    @Transactional
    public Optional<Flight> replan(Pilot pilot, Long id, SaveFlightRequest request) {
        Aircraft flown = flownIn(pilot, request);
        Optional<Flight> theirs = get(pilot, id);
        if (theirs.isPresent() && reviews.existsByFlightId(id)) {
            throw new ErrorResponseException(
                    HttpStatus.CONFLICT,
                    ProblemDetail.forStatusAndDetail(
                            HttpStatus.CONFLICT,
                            "This flight was put to an instructor for the solo cross-country review, so its route "
                                    + "stays as reviewed: save the new plan as a new flight."),
                    null);
        }
        return theirs.map(f ->
                flights.save(filed(f.replanned(flown, request.departureIdent(), request.destinationIdent()), request)));
    }

    private Aircraft flownIn(Pilot pilot, SaveFlightRequest request) {
        return request.aircraftId() == null
                ? null
                : aircraft.findByIdAndPilotId(request.aircraftId(), pilot.getId())
                        .orElseThrow(() -> new NoSuchAircraftException(request.aircraftId()));
    }

    private static Flight filed(Flight flight, SaveFlightRequest request) {
        flight.withStops(
                        request.stops() == null
                                ? null
                                : request.stops().stream()
                                        .map(String::toUpperCase)
                                        .toList())
                .withOwnAltitudes(
                        request.altitudes() == null ? null : request.altitudes().toUpperCase())
                .withPicks(request.picks());
        List<SaveFlightCheckpointRequest> requestedCheckpoints =
                request.checkpoints() == null ? List.of() : request.checkpoints();
        List<FlightCheckpoint> navLog = requestedCheckpoints.stream()
                .map(c -> new FlightCheckpoint(
                                c.sequenceNo(), c.name(), c.category(), c.lat(), c.lon(), c.alongTrackNm())
                        .withLeg(
                                c.legDistanceNm(),
                                c.trueCourseDeg(),
                                c.magneticHeadingDeg(),
                                c.groundspeedKt(),
                                c.eteMin(),
                                c.fuelGal())
                        .atAltitude(c.altitudeFt()))
                .toList();
        flight.fileNavLog(
                navLog,
                request.cruiseAltitudeFt(),
                request.totalDistanceNm(),
                request.totalEteMin(),
                request.totalFuelGal());
        if (request.plannedFor() != null) {
            flight.plannedFor(request.plannedFor());
        }
        if (request.risk() != null) {
            flight.assessed(
                    request.risk().score(),
                    request.risk().level(),
                    request.risk().factors());
        }
        return flight;
    }

    /** Renames this pilot's flight or changes its notes; empty where the
     *  flight is not theirs. */
    @Transactional
    public Optional<Flight> update(Pilot pilot, Long id, UpdateFlightRequest request) {
        return get(pilot, id).map(f -> flights.save(f.edited(request.name(), request.notes())));
    }

    /** The flight's saved track, where it is this pilot's flight and has
     *  one. */
    public Optional<TrackDto> track(Pilot pilot, Long id) {
        return get(pilot, id).flatMap(f -> trackOf(f.getId()));
    }

    /** A flight's saved track, whoever's it is: for a caller that has
     *  already found the reader may see it (an instructor's, of a flight
     *  put to them: LessonService). */
    public Optional<TrackDto> trackOf(Long flightId) {
        return tracks.findById(flightId).map(t -> {
            try {
                return new TrackDto(t.getSource(), json.readValue(t.getPoints(), POINTS));
            } catch (JacksonException e) {
                throw new IllegalStateException("Flight " + flightId + "'s saved track is not JSON", e);
            }
        });
    }

    /** Whether the flight has a track saved with it. */
    public boolean hasTrack(Long flightId) {
        return tracks.existsById(flightId);
    }

    /** Saves a track with this pilot's flight, replacing one saved before;
     *  false where the flight is not theirs. */
    @Transactional
    public boolean saveTrack(Pilot pilot, Long id, TrackDto track) {
        return get(pilot, id)
                .map(f -> {
                    String points;
                    try {
                        points = json.writeValueAsString(track.points());
                    } catch (JacksonException e) {
                        throw new IllegalStateException("A track's points would not write as JSON", e);
                    }
                    tracks.findById(f.getId())
                            .ifPresentOrElse(
                                    saved -> saved.replace(
                                            track.source(),
                                            points,
                                            track.points().size()),
                                    () -> tracks.save(new FlightTrack(
                                            f.getId(),
                                            track.source(),
                                            points,
                                            track.points().size())));
                    return true;
                })
                .orElse(false);
    }

    /** Takes a flight's saved track out of the account; false where the
     *  flight is not theirs. */
    @Transactional
    public boolean deleteTrack(Pilot pilot, Long id) {
        return get(pilot, id)
                .map(f -> {
                    tracks.deleteById(f.getId());
                    return true;
                })
                .orElse(false);
    }

    public boolean delete(Pilot pilot, Long id) {
        return get(pilot, id)
                .map(f -> {
                    flights.delete(f);
                    return true;
                })
                .orElse(false);
    }
}
