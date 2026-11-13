package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.VorCheck;
import app.wingtipmaps.gateway.dto.HandbookFigures;
import app.wingtipmaps.gateway.dto.InspectionsRequest;
import app.wingtipmaps.gateway.dto.OwnFigures;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

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
            String colour,
            OwnFigures figures) {
        return aircraft.save(keep(
                new Aircraft(
                                pilot,
                                tailNumber,
                                typeDesignator,
                                cruiseTasKt,
                                fuelBurnGph,
                                cruisePowerPct,
                                climbTasKt,
                                climbFuelBurnGph,
                                usableFuelGal)
                        .describeForFlightPlan(Typed.code(equipment), Typed.code(surveillance), Typed.words(colour)),
                figures));
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
            String colour,
            OwnFigures figures) {
        return get(pilot, id)
                .map(a -> aircraft.save(keep(
                        a.update(
                                        tailNumber,
                                        typeDesignator,
                                        cruiseTasKt,
                                        fuelBurnGph,
                                        cruisePowerPct,
                                        climbTasKt,
                                        climbFuelBurnGph,
                                        usableFuelGal)
                                .describeForFlightPlan(
                                        Typed.code(equipment), Typed.code(surveillance), Typed.words(colour)),
                        figures)));
    }

    /** The figures given added to its own, the rest as they were: what an
     *  inline ask saves, one figure at a time (PUT /api/aircraft/{id}/figures). */
    public Optional<Aircraft> addFigures(Pilot pilot, Long id, OwnFigures given) {
        return get(pilot, id).map(a -> aircraft.save(keep(a, figuresOf(a).with(given))));
    }

    /** Its own handbook figures as kept. */
    public static OwnFigures figuresOf(Aircraft a) {
        return new OwnFigures(
                a.getServiceCeilingFt(),
                a.getClimbRateFpm(),
                a.getTaxiFuelGal(),
                a.getGlideRatio(),
                a.getEmptyWeightLb(),
                a.getEmptyMomentLbIn());
    }

    /** `a` with `figures` kept, all six; null figures, as a client from
     *  before them sends, leaves its own as they were. */
    private static Aircraft keep(Aircraft a, OwnFigures figures) {
        if (figures == null) {
            return a;
        }
        return a.keepFigures(
                figures.serviceCeilingFt(),
                figures.climbRateFpm(),
                figures.taxiFuelGal(),
                figures.glideRatio(),
                figures.emptyWeightLb(),
                figures.emptyMomentLbIn());
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
     *  engine checked them); null takes them away. */
    public Optional<Aircraft> keepHandbook(Pilot pilot, Long id, HandbookFigures figures) {
        return get(pilot, id).map(a -> aircraft.save(a.keepHandbook(figures)));
    }

    /** The handbook figures kept with an airplane, as the API gives them;
     *  null where none were. */
    public static HandbookFigures handbookOf(Aircraft a) {
        return a.getHandbook();
    }

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
