package app.wingtipmaps.gateway.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The account's records that no screen of the app reads back whole, for
 * the pilot's export: the reminders already emailed (so none is sent
 * twice) and the subscription row.
 */
public record AccountRecordsDto(
        List<SentReminder> remindersSent, @Nullable SubscriptionRow subscription) {

    /** A reminder emailed: what it was of, the day it runs out, how many days before. */
    public record SentReminder(String what, LocalDate dueOn, int daysBefore, Instant sentAt) {}

    /** The subscription as kept: the free month, what was paid for and through which store. */
    public record SubscriptionRow(
            @Nullable Instant trialStartedAt,
            @Nullable Instant trialEndsAt,
            @Nullable Instant paidUntil,
            @Nullable String plan,
            @Nullable String store,
            @Nullable String storeRef,
            Instant updatedAt) {}
}
