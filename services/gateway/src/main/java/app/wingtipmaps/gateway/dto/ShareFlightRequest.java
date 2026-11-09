package app.wingtipmaps.gateway.dto;

/** Inbound request body for POST /api/flights/{id}/share: whether the
 *  airplane's N-number goes with the flight shared. Left out, it does not
 *  (the pilot's own data stays theirs unless they say). */
public record ShareFlightRequest(boolean includeTail) {}
