package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AirplaneFlown;
import app.wingtipmaps.gateway.dto.CurrencyDatesRequest;
import app.wingtipmaps.gateway.dto.CurrencyDto;
import app.wingtipmaps.gateway.dto.LogbookEntryDto;
import app.wingtipmaps.gateway.dto.LogbookEntryRequest;
import app.wingtipmaps.gateway.dto.LogbookImportRequest;
import app.wingtipmaps.gateway.dto.LogbookImportResult;
import app.wingtipmaps.gateway.dto.RemindersDto;
import app.wingtipmaps.gateway.service.LogbookService;
import app.wingtipmaps.gateway.service.PlannerClient;
import jakarta.validation.Valid;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The pilot's logbook and their currency (worked out by the engine, asked
 * through the planner: {@link PlannerClient#currency}):
 * the entries, newest first, added, changed and taken out one at a
 * time, and where the pilot stands -- passengers by day and at night,
 * the flight review, the medical -- with the two dates they give.
 * Pilot-scoped as the aircraft are: 401 signed out.
 */
@RestController
@org.springframework.web.bind.annotation.RequestMapping("/api/logbook")
public class LogbookController {

    private final LogbookService logbook;
    private final PlannerClient planner;

    public LogbookController(LogbookService logbook, PlannerClient planner) {
        this.logbook = logbook;
        this.planner = planner;
    }

    @GetMapping
    public ResponseEntity<List<LogbookEntryDto>> list(Pilot pilot) {
        return ResponseEntity.ok(
                logbook.list(pilot).stream().map(LogbookController::toDto).toList());
    }

    @PostMapping
    public ResponseEntity<LogbookEntryDto> add(Pilot pilot, @Valid @RequestBody LogbookEntryRequest request) {
        return ResponseEntity.ok(toDto(logbook.add(pilot, request)));
    }

    /** A logbook brought in from a file, its flights not already here added. */
    @PostMapping("/import")
    public ResponseEntity<LogbookImportResult> importAll(
            Pilot pilot, @Valid @RequestBody LogbookImportRequest request) {
        return ResponseEntity.ok(logbook.importAll(pilot, request.entries()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<LogbookEntryDto> update(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody LogbookEntryRequest request) {
        return ResponseEntity.of(logbook.update(pilot, id, request).map(LogbookController::toDto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Pilot pilot, @PathVariable Long id) {
        return PilotResponses.done(logbook.delete(pilot, id));
    }

    /** Where the pilot stands; passengers judged for the airplane to be
     *  flown where its category and class are given (14 CFR
     *  61.57(a)(1)(ii)), a tailwheel not said judged as one; else for the
     *  newest flight's. */
    @GetMapping("/currency")
    public ResponseEntity<CurrencyDto> currency(
            Pilot pilot,
            @RequestParam(required = false) @Nullable String category,
            @RequestParam(required = false) @Nullable String aircraftClass,
            @RequestParam(required = false) @Nullable Boolean tailwheel) {
        AirplaneFlown flying = category == null || aircraftClass == null
                ? null
                : new AirplaneFlown(category, aircraftClass, tailwheel);
        return ResponseEntity.ok(planner.currency(
                logbook.list(pilot),
                pilot.getFlightReviewOn(),
                pilot.getMedicalExpiresOn(),
                pilot.getIpcOn(),
                PilotDay.today(),
                flying));
    }

    /** Whether the pilot is emailed before their currency runs out
     *  (ReminderService). */
    @GetMapping("/reminders")
    public ResponseEntity<RemindersDto> reminders(Pilot pilot) {
        return ResponseEntity.ok(new RemindersDto(pilot.isReminders()));
    }

    @PutMapping("/reminders")
    public ResponseEntity<RemindersDto> setReminders(Pilot pilot, @RequestBody RemindersDto request) {
        return ResponseEntity.ok(
                new RemindersDto(logbook.setReminders(pilot, request.on()).isReminders()));
    }

    @PutMapping("/currency")
    public ResponseEntity<CurrencyDto> setCurrencyDates(Pilot pilot, @RequestBody CurrencyDatesRequest request) {
        return ResponseEntity.ok(currencyOf(logbook.setCurrencyDates(
                pilot, request.flightReviewOn(), request.medicalExpiresOn(), request.ipcOn())));
    }

    private CurrencyDto currencyOf(Pilot pilot) {
        return planner.currency(
                logbook.list(pilot),
                pilot.getFlightReviewOn(),
                pilot.getMedicalExpiresOn(),
                pilot.getIpcOn(),
                PilotDay.today());
    }

    private static LogbookEntryDto toDto(LogbookEntry e) {
        return new LogbookEntryDto(
                e.getId(),
                e.getFlownOn(),
                e.getAircraft(),
                e.getAircraftType(),
                e.getRoute(),
                e.getTotalHours(),
                e.getNightHours(),
                e.getCrossCountryHours(),
                e.getDayLandings(),
                e.getNightLandings(),
                e.getRemarks(),
                e.getDualHours(),
                e.getSoloHours(),
                e.getInstrumentHours(),
                e.getToweredLandings(),
                e.getDistanceNm(),
                e.getLongestLegNm(),
                e.getApproaches(),
                e.isHolding(),
                e.isTracking(),
                e.getAirHours(),
                e.getTouchAndGoes(),
                e.isFromTrack(),
                e.getFlightId(),
                e.getCategory(),
                e.getAircraftClass(),
                e.getTailwheel(),
                e.getFullStopLandings());
    }
}
