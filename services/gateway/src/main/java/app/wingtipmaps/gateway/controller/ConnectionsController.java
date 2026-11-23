package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.ConnectionDto;
import app.wingtipmaps.gateway.security.mcp.ConnectorGrants;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The AI apps the pilot connected through the connector (the MCP server),
 * listed under You and ended one at a time from Wingtip's own side, where
 * before only the app's own settings or deleting the account could (the
 * deep security review of 2026-11-21, N2). Only ever the session's pilot's.
 */
@RestController
@Tag(name = "Pilot", description = "The signed-in pilot")
public class ConnectionsController {

    private final ConnectorGrants grants;

    public ConnectionsController(ConnectorGrants grants) {
        this.grants = grants;
    }

    @Operation(
            summary = "The signed-in pilot's connected AI apps",
            description = "Each connection made through the connector, newest first: its id, the app's name, the "
                    + "scopes granted, when its token was last issued and until when it may be renewed.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Their connections"),
        @ApiResponse(responseCode = "401", description = "No session")
    })
    @GetMapping("/api/me/connections")
    public List<ConnectionDto> connections(Pilot pilot) {
        return grants.connections(pilot.getId());
    }

    @Operation(
            summary = "Disconnect one connected AI app",
            description = "Its access and refresh tokens are revoked at once, so the app's next call is refused; "
                    + "the consent goes with the last connection through that app, so connecting again asks again.")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Disconnected"),
        @ApiResponse(responseCode = "401", description = "No session"),
        @ApiResponse(responseCode = "404", description = "No such connection of theirs")
    })
    @DeleteMapping("/api/me/connections/{id}")
    public ResponseEntity<Void> disconnect(
            Pilot pilot, @Parameter(description = "The connection's id, as listed") @PathVariable String id) {
        return PilotResponses.done(grants.disconnect(pilot.getId(), id));
    }
}
