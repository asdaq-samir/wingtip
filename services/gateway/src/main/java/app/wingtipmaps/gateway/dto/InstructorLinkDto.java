package app.wingtipmaps.gateway.dto;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/** One of a student's instructors: the address asked, and once taken,
 *  the instructor's name and certificate. */
public record InstructorLinkDto(
        Long id,
        String email,
        @Nullable String name,
        @Nullable String certificate,
        boolean accepted,
        Instant askedAt) {}
