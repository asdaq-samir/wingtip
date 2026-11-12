package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AccountRecordsDto;
import app.wingtipmaps.gateway.dto.AircraftDto;
import app.wingtipmaps.gateway.dto.ConnectorGrantDto;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.FlightDto;
import app.wingtipmaps.gateway.dto.FlightShareDto;
import app.wingtipmaps.gateway.dto.FlightSummaryDto;
import app.wingtipmaps.gateway.dto.FlightWatchDto;
import app.wingtipmaps.gateway.dto.InstructorDto;
import app.wingtipmaps.gateway.dto.LogbookEntryDto;
import app.wingtipmaps.gateway.dto.PilotDto;
import app.wingtipmaps.gateway.dto.RemindersDto;
import app.wingtipmaps.gateway.dto.SquawkDto;
import app.wingtipmaps.gateway.dto.TrackDto;
import app.wingtipmaps.gateway.dto.TrainingDto;
import app.wingtipmaps.gateway.planner.model.PlannerCheckpointNote;
import app.wingtipmaps.gateway.security.mcp.ConnectorGrants;
import app.wingtipmaps.gateway.service.AccountRecords;
import app.wingtipmaps.gateway.service.CheckpointNotesClient;
import app.wingtipmaps.gateway.service.PlannerUnavailableException;
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
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Everything the gateway keeps for a pilot, in one file they can take
 * away: the account (with the phone number and home base), their
 * airplanes with their squawks, every saved flight with its nav log,
 * track, share link and flight watch, the logbook, currency, training and
 * the instructing they do -- each part exactly as the app's own endpoint
 * answers it, since it is read through those endpoints, so the file and
 * the app can never disagree on a field -- and what no screen reads back
 * whole: the checkpoint notes they wrote (kept by the planner), the
 * reminders setting and the reminders already sent, the subscription and
 * the paid features' monthly counts, and the AI apps they connected
 * (never a token). The right to a copy of one's data (GDPR article 20,
 * CCPA 1798.100) is the reason, and the privacy policy promises
 * "everything we keep for your account" (docs/legal/privacy.md); the
 * logbook's own CSV stays in the Logbook page, for other logbooks to read.
 *
 * <p>What each device keeps for itself (settings, checklists, kept
 * charts) stays there.
 */
@RestController
@Tag(name = "Pilot", description = "The signed-in pilot")
public class ExportController {

    /** The file's own format, for a reader to check before it reads. */
    static final String FORMAT = "wingtip-maps-export/1";

    private final PilotController account;
    private final AircraftController airplanes;
    private final FlightController flights;
    private final LogbookController logbook;
    private final TrainingController training;
    private final InstructorController instructing;
    private final FlightWatchController watches;
    private final CheckpointNotesClient notes;
    private final AccountRecords records;
    /** The connector's grants, absent in a slice test with no database. */
    private ConnectorGrants connections;

    public ExportController(
            PilotController account,
            AircraftController airplanes,
            FlightController flights,
            LogbookController logbook,
            TrainingController training,
            InstructorController instructing,
            FlightWatchController watches,
            CheckpointNotesClient notes,
            AccountRecords records) {
        this.account = account;
        this.airplanes = airplanes;
        this.flights = flights;
        this.logbook = logbook;
        this.training = training;
        this.instructing = instructing;
        this.watches = watches;
        this.notes = notes;
        this.records = records;
    }

    @Autowired(required = false)
    void setConnections(ConnectorGrants connections) {
        this.connections = connections;
    }

    /** An airplane with its squawks. */
    public record ExportedAirplane(AircraftDto airplane, List<SquawkDto> squawks) {}

    /** A saved flight with its nav log, and its track, share link and
     *  flight watch where it has them. */
    public record ExportedFlight(
            FlightDto flight,
            @Nullable TrackDto track,
            @Nullable FlightShareDto share,
            @Nullable FlightWatchDto watch) {}

    /** The whole of it. */
    public record AccountExport(
            String format,
            Instant exportedAt,
            PilotDto account,
            List<ExportedAirplane> airplanes,
            List<ExportedFlight> flights,
            List<LogbookEntryDto> logbook,
            CurrencyDto currency,
            TrainingDto training,
            InstructorDto instructing,
            @Nullable List<PlannerCheckpointNote> checkpointNotes,
            RemindersDto reminders,
            AccountRecordsDto records,
            List<ConnectorGrantDto> connectedApps) {}

    @Operation(
            summary = "Everything kept for the signed-in pilot, as one JSON file",
            description = "The account, airplanes and squawks, flights with nav logs, tracks, share links and "
                    + "watches, logbook, currency, training and instructing, each as its own endpoint answers it; "
                    + "the pilot's own checkpoint notes, reminders, subscription, paid-feature counts and connected "
                    + "AI apps (never a token); sent as a download.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "The file"),
        @ApiResponse(responseCode = "401", description = "No session")
    })
    @GetMapping("/api/me/export")
    public ResponseEntity<AccountExport> export(Authentication authentication, Pilot pilot) {
        List<ExportedAirplane> planes = body(airplanes.list(pilot), List.<AircraftDto>of()).stream()
                .map(a -> new ExportedAirplane(a, body(airplanes.squawks(pilot, a.id()), List.of())))
                .toList();
        List<ExportedFlight> saved = body(flights.list(pilot), List.<FlightSummaryDto>of()).stream()
                .map(f -> exported(pilot, f))
                .filter(Objects::nonNull)
                .toList();
        AccountExport file = new AccountExport(
                FORMAT,
                Instant.now(),
                body(account.me(authentication), null),
                planes,
                saved,
                body(logbook.list(pilot), List.of()),
                worked(() -> body(logbook.currency(pilot), null)),
                worked(() -> body(training.get(pilot), null)),
                worked(() -> body(instructing.get(pilot), null)),
                worked(() -> notes.mine(pilot)),
                new RemindersDto(pilot.isReminders()),
                records.of(pilot),
                connections == null ? List.of() : connections.of(pilot.getId()));
        String name = "wingtip-maps-" + LocalDate.now(ZoneOffset.UTC) + ".json";
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(name).build().toString())
                .body(file);
    }

    /** A flight in full, with what hangs off it; null where it went meanwhile. */
    private @Nullable ExportedFlight exported(Pilot pilot, FlightSummaryDto summary) {
        FlightDto flight = body(flights.get(pilot, summary.id()), null);
        return flight == null
                ? null
                : new ExportedFlight(
                        flight,
                        body(flights.track(pilot, flight.id()), null),
                        summary.share(),
                        body(watches.get(pilot, flight.id()), null));
    }

    /** A part the planner works out from the records (currency, training,
     *  instructing), or none while it cannot be asked: the records
     *  themselves are the pilot's copy, and a planner outage must not
     *  keep it from them. */
    private static <T> T worked(Supplier<T> part) {
        try {
            return part.get();
        } catch (PlannerUnavailableException down) {
            return null;
        }
    }

    /** An endpoint's answer, or {@code none} where it had nothing. */
    private static <T> T body(ResponseEntity<? extends T> answer, T none) {
        return answer.getStatusCode().is2xxSuccessful() && answer.getBody() != null ? answer.getBody() : none;
    }
}
