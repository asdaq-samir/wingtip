package app.wingtipmaps.gateway.dto;

import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/** Inbound request body for PATCH /api/flights/{id}: what the pilot
 *  edited in place on the saved-flights list. A field left out (null) is
 *  kept as it was; a blank one clears it, so a flight named and then
 *  un-named is shown by its route again. */
public record UpdateFlightRequest(
        /* The flight's own name; blank clears it. */
        @Nullable @Size(max = 80, message = "name is at most 80 characters")
        String name,
        /* The pilot's notes on it; blank clears them. */
        @Nullable @Size(max = 2000, message = "notes are at most 2,000 characters")
        String notes) {}
