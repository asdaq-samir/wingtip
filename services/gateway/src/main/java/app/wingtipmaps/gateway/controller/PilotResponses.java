package app.wingtipmaps.gateway.controller;

import org.springframework.http.ResponseEntity;

/** The 204 of an action done for the pilot, or the 404 of one that found
 *  nothing of theirs to do it to. The pilot is the request's own
 *  ({@link app.wingtipmaps.gateway.security.CurrentPilot}), and an action
 *  that finds something answers {@code ResponseEntity.of}. */
final class PilotResponses {

    private PilotResponses() {}

    static ResponseEntity<Void> done(boolean found) {
        return found
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
