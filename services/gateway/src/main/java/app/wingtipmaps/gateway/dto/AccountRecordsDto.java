package app.wingtipmaps.gateway.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * The account's records that no screen of the app reads back whole, for
 * the pilot's export: the reminders already emailed (so none is sent
 * twice).
 */
public record AccountRecordsDto(List<SentReminder> remindersSent) {

    /** A reminder emailed: what it was of, the day it runs out, how many days before. */
    public record SentReminder(String what, LocalDate dueOn, int daysBefore, Instant sentAt) {}
}
