package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.security.SignInOptions;
import app.wingtipmaps.gateway.security.mcp.ConnectorSettings;
import app.wingtipmaps.gateway.security.mcp.PendingConnection;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * The pages of connecting a pilot's AI app (docs/design/mcp-connector.md):
 * sign in first where they are not, carry on once they are, and their
 * consent: Thymeleaf's templates/connect. Not part of the API's
 * document: browsers open them, nothing calls them.
 */
@Controller
@Hidden
public class ConnectController {

    /** What each scope lets the AI app do, in the pilot's words. */
    static final Map<String, String> SCOPE_WORDS = Map.of(
            ConnectorSettings.READ, "Read your airplanes and saved flights, and plan with them",
            ConnectorSettings.WRITE, "Save flights to your Wingtip account");

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
    public String connect(
            HttpServletRequest request,
            @RequestParam(required = false) String sent,
            @RequestParam(required = false) String throttled,
            Model model) {
        String name = PendingConnection.clientId(request)
                .map(clients::findByClientId)
                .map(RegisteredClient::getClientName)
                .orElse("your AI app");
        model.addAttribute("clientName", name);
        model.addAttribute("providers", signIn.providers());
        model.addAttribute(
                "notice",
                sent != null
                        ? "We sent you a link. Open it to sign in."
                        : throttled != null ? "Too many links were asked for. Try again in an hour." : "");
        return "connect/sign-in";
    }

    /** Where a sign-in lands while a connection waits (SignInLanding). */
    @GetMapping("/connect/continue")
    public String carryOn(HttpServletRequest request, Model model) {
        Optional<String> waiting = PendingConnection.take(request);
        if (waiting.isEmpty()) {
            return "connect/nothing";
        }
        model.addAttribute("authorizeUrl", waiting.get());
        return "connect/carry-on";
    }

    /**
     * The consent page Spring's authorization endpoint sends a signed-in
     * pilot to, with the client, the scopes asked and the request's state.
     * The callback's host is shown as the MCP spec asks (its "Security
     * Considerations": a pilot must see where the answer goes).
     */
    @GetMapping("/oauth2/consent")
    public String consent(
            @RequestParam(OAuth2ParameterNames.CLIENT_ID) String clientId,
            @RequestParam(OAuth2ParameterNames.SCOPE) String scope,
            @RequestParam(OAuth2ParameterNames.STATE) String state,
            Model model) {
        RegisteredClient client = clients.findByClientId(clientId);
        OAuth2Authorization pending = authorizations.findByToken(state, STATE);
        OAuth2AuthorizationRequest asked =
                pending == null ? null : pending.getAttribute(OAuth2AuthorizationRequest.class.getName());
        if (client == null || asked == null || !clientId.equals(asked.getClientId())) {
            return "connect/nothing";
        }
        String redirect = asked.getRedirectUri() != null
                ? asked.getRedirectUri()
                : client.getRedirectUris().iterator().next();
        model.addAttribute("clientName", client.getClientName());
        model.addAttribute("redirectHost", URI.create(redirect).getHost());
        model.addAttribute("clientId", clientId);
        model.addAttribute("state", state);
        model.addAttribute(
                "scopes",
                Arrays.stream(scope.split(" ")).filter(s -> !s.isBlank()).toList());
        model.addAttribute("scopeWords", SCOPE_WORDS);
        return "connect/consent";
    }
}
