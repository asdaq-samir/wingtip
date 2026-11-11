package app.wingtipmaps.gateway.dto;

import jakarta.validation.Valid;
import org.jspecify.annotations.Nullable;

/** An airplane's handbook figures as its pilot confirmed them from a
 *  photographed page -- PUT /api/aircraft/{id}/handbook. Null takes them
 *  away. */
public record HandbookRequest(@Nullable @Valid HandbookFigures figures) {}
