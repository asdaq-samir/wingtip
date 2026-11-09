package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.FlightShare;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.SharedFlightDto;
import app.wingtipmaps.gateway.repository.FlightRepository;
import app.wingtipmaps.gateway.repository.FlightShareRepository;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A pilot's saved flights shared by link, and the flights read by those
 * links. Sharing is the pilot's alone (pilot-scoped as {@link FlightService}
 * is); reading needs only the token, and stops the moment the pilot stops
 * sharing.
 */
@Service
public class FlightShareService {

    /** 128 bits: a link nobody can guess, as a session id is. */
    private static final int TOKEN_BYTES = 16;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final FlightRepository flights;
    private final FlightShareRepository shares;

    public FlightShareService(FlightRepository flights, FlightShareRepository shares) {
        this.flights = flights;
        this.shares = shares;
    }

    /** Shares this pilot's flight, or changes whether its N-number goes
     *  with a share already made (the same link); empty where the flight
     *  is not theirs. */
    @Transactional
    public Optional<FlightShare> share(Pilot pilot, Long flightId, boolean includeTail) {
        return flights.findByIdAndPilotId(flightId, pilot.getId())
                .map(f -> shares.findById(f.getId())
                        .map(s -> s.withTail(includeTail))
                        .orElseGet(() -> shares.save(new FlightShare(f.getId(), newToken(), includeTail))));
    }

    /** Stops sharing this pilot's flight: its link answers 404 from now on,
     *  and a share made again gets a new one. True where the flight is
     *  theirs, shared or not; false where it is not. */
    @Transactional
    public boolean stop(Pilot pilot, Long flightId) {
        return flights.findByIdAndPilotId(flightId, pilot.getId())
                .map(f -> {
                    shares.findById(f.getId()).ifPresent(shares::delete);
                    return true;
                })
                .orElse(false);
    }

    /** The share of one of the pilot's flights, where it is shared. */
    public Optional<FlightShare> shareOf(Long flightId) {
        return shares.findById(flightId);
    }

    /** The shares among these flights, by flight: the list's, in one query. */
    public Map<Long, FlightShare> sharesOf(Collection<Flight> of) {
        if (of.isEmpty()) {
            return Map.of();
        }
        return shares.findByFlightIdIn(of.stream().map(Flight::getId).toList()).stream()
                .collect(Collectors.toMap(FlightShare::getFlightId, Function.identity()));
    }

    /** The flight a link names, as its reader sees it; empty for a token
     *  that is not (or no longer) a share. */
    @Transactional(readOnly = true)
    public Optional<SharedFlightDto> shared(String token) {
        if (token == null || token.isBlank() || token.length() > 32) {
            return Optional.empty();
        }
        return shares.findByToken(token)
                .flatMap(s -> flights.findWithNavLogById(s.getFlightId()).map(f -> SharedFlightDto.of(f, s)));
    }

    private static String newToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
