package app.wingtipmaps.gateway.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The pilot's name as their certificate gives it -- PUT /api/training/name.
 *  A name's characters alone: it goes into the mail that asks an
 *  instructor in, to an address of the student's choosing (round 4's
 *  security review, L4). */
public record FullNameRequest(
        @NotBlank(message = "fullName is required")
        @Size(max = 120, message = "fullName is at most 120 characters")
        @Pattern(
                regexp = "[\\p{L}\\p{M} .,'’-]+",
                message = "fullName may hold only letters, spaces, periods, commas, apostrophes and hyphens")
        String fullName) {}
