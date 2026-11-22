package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.PaperworkDto;
import app.wingtipmaps.gateway.planner.model.PlannerPaperworkDue;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** An airplane's paperwork as the list has it: each item named and cited
 *  as the engine's inspections_due gives it (held to the shared
 *  apps/web/src/lib/fixtures/records.json, the 100-hour only for hire, an
 *  AD by its number and 14 CFR 39.7), the days and hours left counted from
 *  today, soonest first; and the reminders made of it. */
class PaperworkListTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 8);

    private static Aircraft airplane() {
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
        return a.forHire(true);
    }

    private static PlannerPaperworkDue due(
            String what, Integer item, String label, String rule, LocalDate until, Double hours, String lead) {
        return new PlannerPaperworkDue(
                hours == null ? null : BigDecimal.valueOf(hours), item, label, lead, rule, until, what);
    }

    /** As the engine answers records.json's N12345 case, flown for hire. */
    private static final List<PlannerPaperworkDue> DUE = List.of(
            due(
                    "annual",
                    null,
                    "Annual Inspection",
                    "14 CFR 91.409(a)",
                    LocalDate.of(2026, 11, 30),
                    null,
                    "N12345's annual inspection runs out"),
            due(
                    "hundred-hour",
                    null,
                    "100-Hour Inspection",
                    "14 CFR 91.409(b)",
                    null,
                    2350.0,
                    "N12345's 100-hour inspection is due"),
            due(
                    "elt-battery",
                    null,
                    "ELT Battery",
                    "14 CFR 91.207(c)",
                    LocalDate.of(2026, 11, 15),
                    null,
                    "N12345's ELT battery is to be replaced by"),
            due(
                    "transponder",
                    null,
                    "Transponder",
                    "14 CFR 91.413(a)",
                    LocalDate.of(2027, 1, 31),
                    null,
                    "N12345's transponder test runs out"),
            due(
                    "item",
                    40,
                    "Oil filter adapter",
                    "AD 2011-10-09, 14 CFR 39.7",
                    LocalDate.of(2026, 12, 1),
                    null,
                    "N12345: AD 2011-10-09 (Oil filter adapter) is due"));

    @Test
    void eachItemAsTheEngineNamesAndCitesIt() {
        List<PaperworkService.Due> due = PaperworkService.ofAircraft(airplane(), DUE);
        assertThat(due)
                .extracting(PaperworkService.Due::what)
                .containsExactly("annual", "hundred-hour", "elt-battery", "transponder", "item");
        // An owner's item is reminded of by its own key, the rest by the airplane's.
        assertThat(due.get(4).key()).isEqualTo("item-40");
        assertThat(due.get(4).itemId()).isEqualTo(40L);
        assertThat(due)
                .extracting(PaperworkService.Due::rule)
                .contains("14 CFR 91.409(b)", "AD 2011-10-09, 14 CFR 39.7");
        // The 100-hour falls due by hours, so it is listed but never emailed.
        assertThat(due).extracting(PaperworkService.Due::emailed).containsExactly(true, false, true, true, true);

        PaperworkDto list = PaperworkService.toDto(due, TODAY);
        // The ELT battery in 7 days, the annual in 22, the AD in 23, the
        // transponder in 84, then the 100-hour, 19.5 hours on.
        assertThat(list.items())
                .extracting(PaperworkDto.DueDto::what)
                .containsExactly("elt-battery", "annual", "item", "transponder", "hundred-hour");
        assertThat(list.items()).extracting(PaperworkDto.DueDto::daysLeft).containsExactly(7L, 22L, 23L, 84L, null);
        assertThat(list.items().get(4).hoursLeft()).isEqualTo(19.5);
    }

    @Test
    void theRemindersAreTheEnginesWordsWithTheDay() {
        assertThat(ReminderService.due(PaperworkService.ofAircraft(airplane(), DUE), TODAY))
                .extracting(ReminderService.Reminder::words)
                .containsExactly(
                        "N12345's annual inspection runs out 30 November 2026, in 22 days (14 CFR 91.409(a)).",
                        "N12345's ELT battery is to be replaced by 15 November 2026, in 7 days (14 CFR 91.207(c)).",
                        "N12345: AD 2011-10-09 (Oil filter adapter) is due 1 December 2026, in 23 days (AD 2011-10-09, 14 CFR 39.7).");
    }
}
