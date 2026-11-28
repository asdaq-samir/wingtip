package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AirplaneKind;
import app.wingtipmaps.gateway.dto.OwnFigures;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/** The pilot-scoping guard on update/delete, without a database --
 *  {@code FlightPersistenceTest}-style tests already prove the
 *  repository query itself scopes correctly; these prove the service
 *  actually calls it rather than {@code findById}. */
@ExtendWith(MockitoExtension.class)
class AircraftServiceTest {

    @Mock
    private AircraftRepository aircraftRepository;

    @InjectMocks
    private AircraftService aircraftService;

    // Pilot's id is JPA-generated, so a plain `new Pilot(...)` leaves it
    // null -- indistinguishable from another un-persisted Pilot. Set
    // directly so owner/stranger stub against different ids, the way two
    // real, saved pilots would.
    private final Pilot owner = pilotWithId(1L, "owner@example.com", "sub-owner");
    private final Pilot stranger = pilotWithId(2L, "stranger@example.com", "sub-stranger");

    private static Pilot pilotWithId(long id, String email, String subject) {
        Pilot pilot = new Pilot(email, "Test Pilot", subject);
        ReflectionTestUtils.setField(pilot, "id", id);
        return pilot;
    }

    @Test
    void updateIsEmptyWhenTheAircraftBelongsToAnotherPilot() {
        given(aircraftRepository.findByIdAndPilotId(1L, stranger.getId())).willReturn(Optional.empty());

        Optional<Aircraft> result = aircraftService.update(
                stranger, 1L, "N12345", "C172", 110.0, 8.5, null, null, null, null, null, null, null, null, null, null,
                null);

        assertThat(result).isEmpty();
        verify(aircraftRepository, never()).save(any());
    }

    @Test
    void updateSavesWhenTheAircraftBelongsToThisPilot() {
        Aircraft existing = new Aircraft(owner, "N12345", "C172", 110.0, 8.5, null, null, null, null, null, null);
        given(aircraftRepository.findByIdAndPilotId(1L, owner.getId())).willReturn(Optional.of(existing));
        given(aircraftRepository.save(existing)).willReturn(existing);

        Optional<Aircraft> result = aircraftService.update(
                owner,
                1L,
                "N54321",
                "PA28",
                115.0,
                9.0,
                75.0,
                80.0,
                12.0,
                90.0,
                7.5,
                48.0,
                " sdfgry ",
                "b1",
                "  White   blue stripes ",
                new OwnFigures(13000.0, 650.0, 1.1, 8.5, 1500.0, 57000.0),
                new AirplaneKind("Airplane", " Single-engine land ", true));

        assertThat(result).isPresent();
        assertThat(result.get().getTailNumber()).isEqualTo("N54321");
        assertThat(result.get().getCruisePowerPct()).isEqualTo(75.0);
        assertThat(result.get().getClimbTasKt()).isEqualTo(80.0);
        assertThat(result.get().getClimbFuelBurnGph()).isEqualTo(12.0);
        // Item 10's codes in capitals, as AIM Appendix 4 writes them; the
        // colour's words with their spaces made single.
        assertThat(result.get().getEquipment()).isEqualTo("SDFGRY");
        assertThat(result.get().getSurveillance()).isEqualTo("B1");
        assertThat(result.get().getColour()).isEqualTo("White blue stripes");
        assertThat(result.get().getServiceCeilingFt()).isEqualTo(13000.0);
        assertThat(result.get().getEmptyMomentLbIn()).isEqualTo(57000.0);
        // Its category, class and gear (14 CFR 61.5(b), 61.57(a)(1)(ii)),
        // the class's words without the spaces typed round them.
        assertThat(result.get().getCategory()).isEqualTo("Airplane");
        assertThat(result.get().getAircraftClass()).isEqualTo("Single-engine land");
        assertThat(result.get().getTailwheel()).isTrue();
    }

    /** Its category, class and gear left out, as a client from before them
     *  sends (the phones' forms), stay as they were; a blank word is none. */
    @Test
    void anUpdateWithNoKindKeepsItsClassAndABlankOneIsNone() {
        Aircraft existing = new Aircraft(owner, "N12345", "C172", 110.0, 8.5, null, null, null, null, null, null)
                .kind("Airplane", "Single-engine land", false);
        given(aircraftRepository.findByIdAndPilotId(1L, owner.getId())).willReturn(Optional.of(existing));
        given(aircraftRepository.save(existing)).willReturn(existing);

        Aircraft kept = aircraftService
                .update(
                        owner, 1L, "N12345", "C172", 110.0, 8.5, null, null, null, null, null, null, null, null, null,
                        null, null)
                .orElseThrow();
        assertThat(kept.getAircraftClass()).isEqualTo("Single-engine land");
        assertThat(kept.getTailwheel()).isFalse();

        Aircraft cleared = aircraftService
                .update(
                        owner,
                        1L,
                        "N12345",
                        "C172",
                        110.0,
                        8.5,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        new AirplaneKind(" ", null, null))
                .orElseThrow();
        assertThat(cleared.getCategory()).isNull();
        assertThat(cleared.getAircraftClass()).isNull();
        assertThat(cleared.getTailwheel()).isNull();
    }

    /** Figures left out of the form, as a client from before them sends,
     *  keep the airplane's own as they were. */
    @Test
    void anUpdateWithNoFiguresKeepsTheAirplanesOwn() {
        Aircraft existing = new Aircraft(owner, "N12345", "XYZ1", 110.0, 8.5, null, null, null, null, null, null)
                .keepFigures(12000.0, 600.0, null, 9.0, null, null);
        given(aircraftRepository.findByIdAndPilotId(1L, owner.getId())).willReturn(Optional.of(existing));
        given(aircraftRepository.save(existing)).willReturn(existing);

        Aircraft saved = aircraftService
                .update(
                        owner, 1L, "N12345", "XYZ1", 110.0, 8.5, null, null, null, null, null, null, null, null, null,
                        null, null)
                .orElseThrow();

        assertThat(saved.getServiceCeilingFt()).isEqualTo(12000.0);
        assertThat(saved.getGlideRatio()).isEqualTo(9.0);
    }

    /** An inline ask saves one figure, the rest as they were. */
    @Test
    void addingAFigureKeepsTheRest() {
        Aircraft existing = new Aircraft(owner, "N12345", "XYZ1", 110.0, 8.5, null, null, null, null, null, null)
                .keepFigures(12000.0, 600.0, null, 9.0, null, null);
        given(aircraftRepository.findByIdAndPilotId(1L, owner.getId())).willReturn(Optional.of(existing));
        given(aircraftRepository.save(existing)).willReturn(existing);

        Aircraft saved = aircraftService
                .addFigures(owner, 1L, new OwnFigures(null, null, 1.2, null, null, null))
                .orElseThrow();

        assertThat(saved.getTaxiFuelGal()).isEqualTo(1.2);
        assertThat(saved.getServiceCeilingFt()).isEqualTo(12000.0);
        assertThat(saved.getClimbRateFpm()).isEqualTo(600.0);
        assertThat(saved.getGlideRatio()).isEqualTo(9.0);
    }

    @Test
    void addingFiguresToAnotherPilotsAirplaneSavesNothing() {
        given(aircraftRepository.findByIdAndPilotId(1L, stranger.getId())).willReturn(Optional.empty());

        assertThat(aircraftService.addFigures(stranger, 1L, OwnFigures.NONE)).isEmpty();
        verify(aircraftRepository, never()).save(any());
    }

    /** A flight plan item left blank is none, not an empty string the
     *  form would show as said. */
    @Test
    void aBlankFlightPlanItemIsNone() {
        Aircraft existing = new Aircraft(owner, "N12345", "C172", 110.0, 8.5, null, null, null, null, null, null)
                .describeForFlightPlan("S", "C", "Red");
        given(aircraftRepository.findByIdAndPilotId(1L, owner.getId())).willReturn(Optional.of(existing));
        given(aircraftRepository.save(existing)).willReturn(existing);

        Aircraft saved = aircraftService
                .update(
                        owner, 1L, "N12345", "C172", 110.0, 8.5, null, null, null, null, null, null, " ", "", null,
                        null, null)
                .orElseThrow();

        assertThat(saved.getEquipment()).isNull();
        assertThat(saved.getSurveillance()).isNull();
        assertThat(saved.getColour()).isNull();
    }

    @Test
    void deleteReturnsFalseWithoutDeletingWhenTheAircraftBelongsToAnotherPilot() {
        given(aircraftRepository.findByIdAndPilotId(1L, stranger.getId())).willReturn(Optional.empty());

        boolean deleted = aircraftService.delete(stranger, 1L);

        assertThat(deleted).isFalse();
        verify(aircraftRepository, never()).delete(any());
    }

    @Test
    void deleteReturnsTrueWhenTheAircraftBelongsToThisPilot() {
        Aircraft existing = new Aircraft(owner, "N12345", "C172", 110.0, 8.5, null, null, null, null, null, null);
        given(aircraftRepository.findByIdAndPilotId(1L, owner.getId())).willReturn(Optional.of(existing));

        boolean deleted = aircraftService.delete(owner, 1L);

        assertThat(deleted).isTrue();
        verify(aircraftRepository).delete(existing);
    }
}
