package app.wingtipmaps.gateway.dto;

import java.time.LocalDate;
import org.jspecify.annotations.Nullable;

/** An endorsement recorded from paper: its code (the engine's endorsement_kinds), the
 *  day, the day it runs out where it does, and the make and model it names
 *  where the pilot recorded one. */
public record EndorsementDto(
        String code,
        LocalDate endorsedOn,
        @Nullable LocalDate until,
        @Nullable String makeModel) {}
