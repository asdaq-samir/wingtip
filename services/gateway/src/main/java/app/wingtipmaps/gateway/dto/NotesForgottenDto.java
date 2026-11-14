package app.wingtipmaps.gateway.dto;

/** How many of the pilot's own checkpoint notes went -- DELETE /api/me/checkpoint-notes. */
public record NotesForgottenDto(int removed) {}
