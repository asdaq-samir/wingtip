package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.VorCheck;
import app.wingtipmaps.gateway.dto.HandbookFigures;
import app.wingtipmaps.gateway.dto.InspectionsRequest;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** A pilot's own aeroplanes -- CRUD, all of it scoped by pilot id at
 *  the repository layer ({@link AircraftRepository#findByIdAndPilotId})
 *  so one pilot can never read or edit another's by guessing an id. */
@Service
public class AircraftService {

    private final AircraftRepository aircraft;

    public AircraftService(AircraftRepository aircraft) {
        this.aircraft = aircraft;
    }

    public List<Aircraft> list(Pilot pilot) {
        return aircraft.findByPilotIdOrderByTailNumberAsc(pilot.getId());
    }

    public Optional<Aircraft> get(Pilot pilot, Long id) {
        return aircraft.findByIdAndPilotId(id, pilot.getId());
    }

    public Aircraft add(
            Pilot pilot,
            String tailNumber,
            String typeDesignator,
            double cruiseTasKt,
            double fuelBurnGph,
            Double cruisePowerPct,
            Double climbTasKt,
            Double climbFuelBurnGph,
            Double usableFuelGal,
            String equipment,
            String surveillance,
            String colour) {
        return aircraft.save(new Aircraft(
                        pilot,
                        tailNumber,
                        typeDesignator,
                        cruiseTasKt,
                        fuelBurnGph,
                        cruisePowerPct,
                        climbTasKt,
                        climbFuelBurnGph,
                        usableFuelGal)
                .describeForFlightPlan(Typed.code(equipment), Typed.code(surveillance), Typed.words(colour)));
    }

    /** Empty when no such aircraft exists for this pilot -- not
     *  distinguished from "belongs to someone else," which reads
     *  identically to a caller guessing ids on purpose. */
    public Optional<Aircraft> update(
            Pilot pilot,
            Long id,
            String tailNumber,
            String typeDesignator,
            double cruiseTasKt,
            double fuelBurnGph,
            Double cruisePowerPct,
            Double climbTasKt,
            Double climbFuelBurnGph,
            Double usableFuelGal,
            String equipment,
            String surveillance,
            String colour) {
        return get(pilot, id)
                .map(a -> aircraft.save(a.update(
                                tailNumber,
                                typeDesignator,
                                cruiseTasKt,
                                fuelBurnGph,
                                cruisePowerPct,
                                climbTasKt,
                                climbFuelBurnGph,
                                usableFuelGal)
                        .describeForFlightPlan(Typed.code(equipment), Typed.code(surveillance), Typed.words(colour))));
    }

    /** The airplane's VOR check for IFR, as the pilot records it (14 CFR 91.171(d)). */
    public Optional<Aircraft> recordVorCheck(
            Pilot pilot, Long id, LocalDate on, VorCheck kind, String place, double errorDeg) {
        return get(pilot, id).map(a -> aircraft.save(a.recordVorCheck(on, kind, Typed.text(place), errorDeg)));
    }

    /** The airplane's inspections and tests, as its owner records them. */
    public Optional<Aircraft> recordInspections(Pilot pilot, Long id, InspectionsRequest r) {
        return get(pilot, id)
                .map(a -> aircraft.save(a.recordInspections(
                                r.annualOn(),
                                r.hundredHourAtHours(),
                                r.hoursNow(),
                                r.staticCheckOn(),
                                r.transponderCheckOn(),
                                r.eltInspectedOn(),
                                r.eltBatteryDueOn())
                        .forHire(r.forHire() == null ? a.isForHire() : r.forHire())));
    }

    /** Its handbook figures as its pilot confirmed them, kept as sent (the
     *  engine checked them, through the assistant); null takes them away. */
    public Optional<Aircraft> keepHandbook(Pilot pilot, Long id, HandbookFigures figures) {
        Map<String, Object> kept = figures == null ? null : JSON.convertValue(figures, AS_MAP);
        return get(pilot, id).map(a -> aircraft.save(a.keepHandbook(kept)));
    }

    /** The handbook figures kept with an airplane, as the API gives them;
     *  null where none were. */
    public static HandbookFigures handbookOf(Aircraft a) {
        return a.getHandbook() == null ? null : JSON.convertValue(a.getHandbook(), HandbookFigures.class);
    }

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> AS_MAP = new TypeReference<>() {};

    /** @return true if an aircraft was actually deleted */
    public boolean delete(Pilot pilot, Long id) {
        return get(pilot, id)
                .map(a -> {
                    aircraft.delete(a);
                    return true;
                })
                .orElse(false);
    }
}
