package app.wingtipmaps.gateway.dto;

import app.wingtipmaps.gateway.domain.DeferredFor;
import java.time.LocalDate;
import org.springframework.lang.Nullable;

/** A squawk as the API returns it. */
public record SquawkDto(
        Long id,
        LocalDate reportedOn,
        String text,
        boolean inoperative,
        @Nullable DeferredFor deferredFor,
        @Nullable LocalDate fixedOn,
        @Nullable String fixNote) {}
