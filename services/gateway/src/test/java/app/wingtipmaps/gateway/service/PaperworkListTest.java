package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.AircraftDueItem;
import app.wingtipmaps.gateway.domain.DueItemKind;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.PaperworkDto;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** An airplane's paperwork as the list has it: each recorded inspection
 *  with its rule, the 100-hour only for hire (14 CFR 91.409(b)), the
 *  owner's items with an AD's number as their rule, the days and hours
 *  left counted from today, soonest first; and the reminders made of it. */
class PaperworkListTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 8);

    private static Aircraft airplane(boolean forHire) {
        Aircraft a = new Aircraft(
                new Pilot("pilot@example.com", "A. Pilot", "sub-1"),
                "N12345",
                "C172",
                110,
                8.5,
                null,
                null,
                null,
                null,
                null,
                40.0);
        a.recordInspections(
                LocalDate.of(2025, 11, 20),
                2250.0,
                2330.5,
                null,
                LocalDate.of(2025, 1, 3),
                null,
                LocalDate.of(2026, 11, 15));
        return a.forHire(forHire);
    }

    /** As the engine answers for the airplane above: the annual through 30
     *  November 2026 (91.409(a)), the transponder through 31 January 2027
     *  (91.413(a)), the 100-hour at 2350 hours. */
    private static final PlannerInspections DUE = new PlannerInspections()
            .annualUntil(LocalDate.of(2026, 11, 30))
            .transponderCheckUntil(LocalDate.of(2027, 1, 31))
            .hundredHourDueAtHours(new BigDecimal("2350.0"));

    @Test
    void eachRecordedInspectionWithItsRuleAndThe100HourOnlyForHire() {
        List<PaperworkService.Due> notForHire = PaperworkService.ofAircraft(airplane(false), DUE, List.of());
        assertThat(notForHire)
                .extracting(PaperworkService.Due::what)
                .containsExactly("annual", "elt-battery", "transponder");
        assertThat(notForHire)
                .extracting(PaperworkService.Due::rule)
                .containsExactly("14 CFR 91.409(a)", "14 CFR 91.207(c)", "14 CFR 91.413(a)");

        List<PaperworkService.Due> forHire = PaperworkService.ofAircraft(airplane(true), DUE, List.of());
        assertThat(forHire).extracting(PaperworkService.Due::what).contains("hundred-hour");
        PaperworkDto list = PaperworkService.toDto(forHire, TODAY);
        // The ELT battery in 7 days, the annual in 22, the transponder in 84,
        // then the 100-hour, 19.5 hours on.
        assertThat(list.items())
                .extracting(PaperworkDto.DueDto::what)
                .containsExactly("elt-battery", "annual", "transponder", "hundred-hour");
        assertThat(list.items()).extracting(PaperworkDto.DueDto::daysLeft).containsExactly(7L, 22L, 84L, null);
        assertThat(list.items().get(3).hoursLeft()).isEqualTo(19.5);
    }

    @Test
    void anADsNumberIsItsRuleAndAnUndatedItemIsNotListed() {
        Aircraft a = airplane(false);
        AircraftDueItem ad = new AircraftDueItem(a)
                .set(
                        DueItemKind.AD,
                        "Oil filter adapter",
                        "AD 2011-10-09",
                        "Inspect each 100 hours",
                        LocalDate.of(2026, 12, 1),
                        null);
        AircraftDueItem done =
                new AircraftDueItem(a).set(DueItemKind.AD, "Seat rails", "AD 2011-10-01", "Complied with", null, null);
        List<PaperworkService.Due> due = PaperworkService.ofAircraft(a, null, List.of(ad, done));
        assertThat(due).extracting(PaperworkService.Due::what).containsExactly("elt-battery", "item");
        assertThat(due.get(1).rule()).isEqualTo("AD 2011-10-09, 14 CFR 39.7");
        assertThat(ReminderService.due(due, TODAY))
                .extracting(ReminderService.Reminder::words)
                .containsExactly(
                        "N12345's ELT battery is to be replaced by 15 November 2026, in 7 days (14 CFR 91.207(c)).",
                        "N12345: AD 2011-10-09 (Oil filter adapter) is due 1 December 2026, in 23 days (AD 2011-10-09, 14 CFR 39.7).");
    }
}
