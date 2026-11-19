package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.planner.model.PlannerPaperworkDue;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** What is coming up on a day: within 30 days, each by the nearer of its
 *  two reminders -- 30 days before, then 7 -- in the rule's words; nothing
 *  past or further off. */
class ReminderDueTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 11);

    /** The pilot's own as the engine's pilot_currency lists them (held to
     *  the shared currency.json), each where it has a day. */
    private static List<PlannerPaperworkDue> currency(
            LocalDate review, LocalDate medical, LocalDate day, LocalDate night, LocalDate instrument) {
        List<PlannerPaperworkDue> out = new ArrayList<>();
        add(out, "flight-review", "Flight review", "14 CFR 61.56(c)", review, "Your flight review runs out");
        add(out, "medical", "Medical certificate", "14 CFR 61.23", medical, "Your medical certificate runs out");
        add(
                out,
                "day-passengers",
                "Passengers by day",
                "14 CFR 61.57(a)",
                day,
                "You may carry passengers by day until");
        add(
                out,
                "night-passengers",
                "Passengers at night",
                "14 CFR 61.57(b)",
                night,
                "You may carry passengers at night until");
        add(
                out,
                "instrument",
                "Instrument currency",
                "14 CFR 61.57(c)",
                instrument,
                "Your instrument currency runs out");
        return out;
    }

    private static void add(
            List<PlannerPaperworkDue> out, String what, String label, String rule, LocalDate until, String lead) {
        if (until != null) {
            out.add(new PlannerPaperworkDue(null, null, label, lead, rule, until, what));
        }
    }

    @Test
    void eachWithinThirtyDaysByTheNearerOfItsTwoReminders() {
        List<ReminderService.Reminder> due = ReminderService.due(
                PaperworkService.ofPilot(currency(
                        LocalDate.of(2026, 11, 8), // 28 days: the 30-day one
                        LocalDate.of(2026, 10, 18), // 7 days: the 7-day one
                        LocalDate.of(2026, 11, 20), // 40 days: none yet
                        LocalDate.of(2026, 10, 10), // yesterday: run out, none
                        TODAY)),
                TODAY); // today: the 7-day one
        assertThat(due)
                .extracting(ReminderService.Reminder::what)
                .containsExactly("flight-review", "medical", "instrument");
        assertThat(due).extracting(ReminderService.Reminder::daysBefore).containsExactly(30, 7, 7);
        assertThat(due.get(0).words())
                .isEqualTo("Your flight review runs out 8 November 2026, in 28 days (14 CFR 61.56(c)).");
        assertThat(due.get(2).words())
                .isEqualTo("Your instrument currency runs out 11 October 2026, today (14 CFR 61.57(c)).");
    }

    @Test
    void oneReminderIsItsOwnSubjectAndSeveralAreCounted() {
        var pilot = new app.wingtipmaps.gateway.domain.Pilot("pilot@example.com", "A. Pilot", "sub-1");
        List<ReminderService.Reminder> due = ReminderService.due(
                PaperworkService.ofPilot(currency(null, LocalDate.of(2026, 10, 12), null, null, null)), TODAY);
        assertThat(ReminderService.message(pilot, due).getSubject())
                .isEqualTo("Wingtip Maps: Your medical certificate runs out 12 October 2026");
        assertThat(ReminderService.message(pilot, due).getText())
                .contains("- Your medical certificate runs out 12 October 2026, tomorrow (14 CFR 61.23).");
        List<ReminderService.Reminder> two = ReminderService.due(
                PaperworkService.ofPilot(
                        currency(LocalDate.of(2026, 10, 20), LocalDate.of(2026, 10, 12), null, null, null)),
                TODAY);
        assertThat(ReminderService.message(pilot, two).getSubject()).isEqualTo("Wingtip Maps: 2 dates coming up");
    }
}
