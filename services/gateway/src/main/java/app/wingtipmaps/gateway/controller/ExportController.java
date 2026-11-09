package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.dto.AircraftDto;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.FlightDto;
import app.wingtipmaps.gateway.dto.FlightSummaryDto;
import app.wingtipmaps.gateway.dto.InstructorDto;
import app.wingtipmaps.gateway.dto.LogbookEntryDto;
import app.wingtipmaps.gateway.dto.PilotDto;
import app.wingtipmaps.gateway.dto.SquawkDto;
import app.wingtipmaps.gateway.dto.TrackDto;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.PlannerClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Everything the gateway keeps for a pilot, in one file they can take
 * away: the account, their airplanes with their squawks, every saved
 * flight with its nav log and track, the logbook, currency, training and
 * the instructing they do -- each part exactly as the app's own endpoint
 * answers it, since it is read through those endpoints, so the file and
 * the app can never disagree on a field. The right to a copy of one's
 * data (GDPR article 20, CCPA 1798.100) is the reason; the logbook's own
 * CSV stays in the Logbook page, for other logbooks to read.
 *
 * <p>What the gateway does not keep is not in it: the checkpoint notes
 * the planner holds are read in the app, and what each device keeps for
 * itself (settings, checklists, kept charts) stays there.
 */
@RestController
@Tag(name = "Pilot", description = "The signed-in pilot")
public class ExportController {

    /** The file's own format, for a reader to check before it reads. */
    static final String FORMAT = "wingtip-maps-export/1";

    private final PilotService pilots;
    private final PilotController account;
    private final AircraftController airplanes;
    private final FlightController flights;
    private final LogbookController logbook;
    private final TrainingController training;
    private final InstructorController instructing;

    public ExportController(PilotService pilots, PilotController account, AircraftController airplanes,
            FlightController flights, LogbookController logbook, TrainingController training,
            InstructorController instructing) {
        this.pilots = pilots;
        this.account = account;
        this.airplanes = airplanes;
        this.flights = flights;
        this.logbook = logbook;
        this.training = training;
        this.instructing = instructing;
    }

    /** An airplane with its squawks. */
    public record ExportedAirplane(AircraftDto airplane, List<SquawkDto> squawks) {}

    /** A saved flight with its nav log, and its track where one was saved. */
    public record ExportedFlight(FlightDto flight, TrackDto track) {}

    /** The whole of it. */
    public record AccountExport(String format, Instant exportedAt, PilotDto account, List<ExportedAirplane> airplanes,
            List<ExportedFlight> flights, List<LogbookEntryDto> logbook, CurrencyDto currency, TrainingDto training,
            InstructorDto instructing) {}

    @Operation(summary = "Everything kept for the signed-in pilot, as one JSON file",
            description = "The account, airplanes and squawks, flights with nav logs and tracks, logbook, currency, "
                    + "training and instructing, each as its own endpoint answers it; sent as a download.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The file"),
        @ApiResponse(responseCode = "401", description = "No session")
    })
    @GetMapping("/api/me/export")
    public ResponseEntity<AccountExport> export(Authentication authentication) {
        return PilotResponses.withPilot(pilots, authentication, pilot -> {
            List<ExportedAirplane> planes = body(airplanes.list(authentication), List.<AircraftDto>of()).stream()
                    .map(a -> new ExportedAirplane(a, body(airplanes.squawks(authentication, a.id()), List.of())))
                    .toList();
            List<ExportedFlight> saved = body(flights.list(authentication), List.<FlightSummaryDto>of()).stream()
                    .map(f -> body(flights.get(authentication, f.id()), null))
                    .filter(Objects::nonNull)
                    .map(f -> new ExportedFlight(f, body(flights.track(authentication, f.id()), null)))
                    .toList();
            AccountExport file = new AccountExport(FORMAT, Instant.now(), body(account.me(authentication), null),
                    planes, saved, body(logbook.list(authentication), List.of()),
                    worked(() -> body(logbook.currency(authentication), null)),
                    worked(() -> body(training.get(authentication), null)),
                    worked(() -> body(instructing.get(authentication), null)));
            String name = "wingtip-maps-" + LocalDate.now(ZoneOffset.UTC) + ".json";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                    .body(file);
        });
    }

    /** A part the planner works out from the records (currency, training,
     *  instructing), or none while it cannot be asked: the records
     *  themselves are the pilot's copy, and a planner outage must not
     *  keep it from them. */
    private static <T> T worked(Supplier<T> part) {
        try {
            return part.get();
        } catch (PlannerClient.Unavailable down) {
            return null;
        }
    }

    /** An endpoint's answer, or {@code none} where it had nothing. */
    private static <T> T body(ResponseEntity<? extends T> answer, T none) {
        return answer.getStatusCode().is2xxSuccessful() && answer.getBody() != null ? answer.getBody() : none;
    }
}
