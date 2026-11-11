package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.security.SignInOptions;
import app.wingtipmaps.gateway.security.mcp.PendingConnection;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The pages of connecting a pilot's AI app (docs/design/mcp-connector.md):
 * sign in first where they are not, carry on once they are, and their
 * consent. Not part of the API's document: browsers open them, nothing
 * calls them.
 */
@RestController
@Hidden
public class ConnectController {

    private static final OAuth2TokenType STATE = new OAuth2TokenType(OAuth2ParameterNames.STATE);

    private final RegisteredClientRepository clients;
    private final OAuth2AuthorizationService authorizations;
    private final SignInOptions signIn;

    public ConnectController(
            RegisteredClientRepository clients, OAuth2AuthorizationService authorizations, SignInOptions signIn) {
        this.clients = clients;
        this.authorizations = authorizations;
        this.signIn = signIn;
    }

    /** Where the authorization server sends a pilot not yet signed in. */
    @GetMapping("/connect")
    public ResponseEntity<String> connect(
            HttpServletRequest request,
            @RequestParam(required = false) String sent,
            @RequestParam(required = false) String throttled) {
        String name = PendingConnection.clientId(request)
                .map(clients::findByClientId)
                .map(RegisteredClient::getClientName)
                .orElse("your AI app");
        String notice = sent != null
                ? "We sent you a link. Open it to sign in."
                : throttled != null ? "Too many links were asked for. Try again in an hour." : "";
        // Read here so the cookie repository writes it: the form posts to
        // the app's own sign-in, which checks it.
        CsrfToken csrf = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        return ConnectPages.page(
                "Connect",
                ConnectPages.signIn(name, signIn.providers(), csrf.getParameterName(), csrf.getToken(), notice));
    }

    /** Where a sign-in lands while a connection waits (SignInLanding). */
    @GetMapping("/connect/continue")
    public ResponseEntity<String> carryOn(HttpServletRequest request) {
        Optional<String> waiting = PendingConnection.take(request);
        return ConnectPages.page("Connect", waiting.map(ConnectPages::carryOn).orElseGet(ConnectPages::nothingWaiting));
    }

    /**
     * The consent page Spring's authorization endpoint sends a signed-in
     * pilot to, with the client, the scopes asked and the request's state.
     * The callback's host is shown as the MCP spec asks (its "Security
     * Considerations": a pilot must see where the answer goes).
     */
    @GetMapping("/oauth2/consent")
    public ResponseEntity<String> consent(
            @RequestParam(OAuth2ParameterNames.CLIENT_ID) String clientId,
            @RequestParam(OAuth2ParameterNames.SCOPE) String scope,
            @RequestParam(OAuth2ParameterNames.STATE) String state) {
        RegisteredClient client = clients.findByClientId(clientId);
        OAuth2Authorization pending = authorizations.findByToken(state, STATE);
        OAuth2AuthorizationRequest asked =
                pending == null ? null : pending.getAttribute(OAuth2AuthorizationRequest.class.getName());
        if (client == null || asked == null || !clientId.equals(asked.getClientId())) {
            return ConnectPages.page("Connect", ConnectPages.nothingWaiting());
        }
        String redirect = asked.getRedirectUri() != null
                ? asked.getRedirectUri()
                : client.getRedirectUris().iterator().next();
        List<String> scopes =
                Arrays.stream(scope.split(" ")).filter(s -> !s.isBlank()).toList();
        return ConnectPages.page(
                "Connect",
                ConnectPages.consent(
                        client.getClientName(), URI.create(redirect).getHost(), clientId, state, scopes));
    }
}
