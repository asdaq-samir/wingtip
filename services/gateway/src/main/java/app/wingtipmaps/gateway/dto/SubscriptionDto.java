package app.wingtipmaps.gateway.dto;

import app.wingtipmaps.gateway.domain.Subscription;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * A pilot's subscription as the app shows it: whether the paid features
 * are theirs, and until when.
 * For the page to say so; the server checks it again on every paid call.
 */
@Schema(description = "The signed-in pilot's subscription to the paid features")
public record SubscriptionDto(
        @Schema(
                description = "FREE (none), TRIAL (the free month), SUBSCRIBED (paid for), or COMPED (given: "
                        + "a developer's, an instructor's)",
                example = "TRIAL")
        State state,

        @Schema(description = "Whether the paid features are theirs now", example = "true")
        boolean entitled,

        @Schema(description = "When the free month or the paid time runs out; null for FREE and COMPED") @Nullable
        Instant until,

        @Schema(description = "Whether the free month is still theirs to start: once an account", example = "false")
        boolean trialAvailable,

        @Schema(description = "The free month's length, days", example = "30")
        int trialDays,

        @Schema(description = "MONTHLY or YEARLY, when paid for")
        Subscription.@Nullable Plan plan,

        @Schema(description = "Where it was bought, when paid for")
        Subscription.@Nullable Store store) {

    public enum State {
        FREE,
        TRIAL,
        SUBSCRIBED,
        COMPED
    }
}
