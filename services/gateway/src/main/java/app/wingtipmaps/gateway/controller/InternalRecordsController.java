package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AircraftDto;
import app.wingtipmaps.gateway.dto.FlightSummaryDto;
import app.wingtipmaps.gateway.dto.SaveFlightRequest;
import app.wingtipmaps.gateway.security.mcp.ConnectorGrants;
import app.wingtipmaps.gateway.security.mcp.ConnectorSettings;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.FlightService;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A pilot's records, for the connector's tools in the planner (app/mcp):
 * their airplanes, their saved flights, and a flight saved from their AI
 * app. The planner has checked the pilot's token and names them by its
 * subject (X-Pilot-Id); it shows it is the planner with the token the two
 * share (app.mcp.internal-token, X-Internal-Token).
 *
 * <p>A token of its own rather than the pilot's: the MCP spec forbids an
 * MCP server passing on the token it was given, which is for it alone.
 * Not in the API's document, on the gateway's internal port alone, which
 * no compose file publishes (InternalPortConfig), and a 404 to anyone
 * without the token, so this answers nobody else -- and nobody at all
 * where the deployment set no token.
 */
@RestController
@Hidden
@RequestMapping("/internal/mcp")
public class InternalRecordsController {

    static final String TOKEN_HEADER = "X-Internal-Token";
    static final String CLIENT_HEADER = "X-Client-Id";

    private final ConnectorSettings settings;
    private final PilotService pilots;
    private final AircraftService aircraft;
    private final FlightService flights;
    private final AircraftDtos dtos;
    private final ConnectorGrants grants;

    public InternalRecordsController(
            ConnectorSettings settings,
            PilotService pilots,
            AircraftService aircraft,
            FlightService flights,
            SquawkService squawks,
            PlannerClient planner,
            DueItemService dueItems,
            ConnectorGrants grants) {
        this.settings = settings;
        this.pilots = pilots;
        this.aircraft = aircraft;
        this.flights = flights;
        this.dtos = new AircraftDtos(squawks, planner, dueItems);
        this.grants = grants;
    }

    @GetMapping("/aircraft")
    public ResponseEntity<List<AircraftDto>> aircraft(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @RequestHeader(value = PlannerProxyController.PILOT_HEADER, required = false) String pilotId) {
        return asPilot(
                token,
                pilotId,
                pilot -> aircraft.list(pilot).stream().map(dtos::of).toList());
    }

    @GetMapping("/flights")
    public ResponseEntity<List<FlightSummaryDto>> flights(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @RequestHeader(value = PlannerProxyController.PILOT_HEADER, required = false) String pilotId) {
        return asPilot(
                token,
                pilotId,
                pilot -> flights.list(pilot).stream().map(FlightSummaryDto::of).toList());
    }

    /** Saved as the app saves one (FlightController), validated the same. */
    @PostMapping("/flights")
    public ResponseEntity<FlightSummaryDto> save(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @RequestHeader(value = PlannerProxyController.PILOT_HEADER, required = false) String pilotId,
            @Valid @RequestBody SaveFlightRequest request) {
        return asPilot(token, pilotId, pilot -> FlightSummaryDto.of(flights.save(pilot, request)));
    }

    /**
     * Whether the pilot's connection through this client is still live
     * (ConnectorGrants.live): 204, or 404 once they deleted their account
     * or disconnected. The planner asks before every MCP call.
     */
    @GetMapping("/connection")
    public ResponseEntity<Void> connection(
            @RequestHeader(value = TOKEN_HEADER, required = false) String token,
            @RequestHeader(value = PlannerProxyController.PILOT_HEADER, required = false) String pilotId,
            @RequestHeader(value = CLIENT_HEADER, required = false) String clientId) {
        return pilot(token, pilotId)
                        .filter(pilot -> clientId != null && grants.live(pilot.getId(), clientId))
                        .isPresent()
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    private <T> ResponseEntity<T> asPilot(String token, String pilotId, Function<Pilot, T> answer) {
        return pilot(token, pilotId)
                .map(answer)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private Optional<Pilot> pilot(String token, String pilotId) {
        if (!trusted(token) || pilotId == null || !pilotId.matches("\\d{1,18}")) {
            return Optional.empty();
        }
        return pilots.byId(Long.parseLong(pilotId));
    }

    /** The shared token, compared in constant time. */
    private boolean trusted(String token) {
        String expected = settings.internalToken();
        return !expected.isBlank()
                && token != null
                && MessageDigest.isEqual(
                        expected.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8));
    }
}
