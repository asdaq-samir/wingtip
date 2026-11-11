package app.wingtipmaps.gateway.security.mcp;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.server.authorization.OAuth2ClientRegistration;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientRegistrationAuthenticationContext;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientRegistrationAuthenticationProvider;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientRegistrationAuthenticationToken;
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientRegistrationAuthenticationValidator;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.converter.OAuth2ClientRegistrationRegisteredClientConverter;
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings;
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings;

/**
 * What a client registering itself (RFC 7591, open: Claude and ChatGPT
 * register as a pilot first connects) may be, and what it is made.
 *
 * <p>Refused: a callback the allowlist does not have ({@link RedirectUris},
 * RFC 7591's invalid_redirect_uri), a name or callbacks longer than a
 * client's ever are ({@link RegistrationLimit} bounds the rest), and a scope that is not one of
 * {@link ConnectorSettings#SCOPES} (invalid_client_metadata).
 *
 * <p>Made, whatever it asked: a public client (no secret: Claude's and
 * ChatGPT's registrations are public, and a secret handed to anyone who
 * asks would prove nothing), with the code and refresh grants, PKCE
 * required, and the pilot's consent asked. RFC 7591 section 3.2.1 lets the
 * server replace what was asked, and the answer says what was registered.
 */
final class ConnectorClients {

    /** Long enough for a few tool calls, short enough that a token taken
     *  from a log is soon worthless; the client refreshes before it ends. */
    static final Duration ACCESS_TOKEN = Duration.ofMinutes(15);

    /** A month without use, as the app's own sign-in lasts. */
    static final Duration REFRESH_TOKEN = Duration.ofDays(30);

    /** The longest client name kept: Claude's and ChatGPT's are a word or
     *  two, and the consent page shows it. */
    static final int NAME_LIMIT = 100;

    /** How many callbacks, and how long each: a connector registers one or
     *  two, and V40's column holds them joined in 1,000 characters. */
    static final int REDIRECT_URIS_LIMIT = 4;

    static final int REDIRECT_URI_LENGTH = 200;

    private static final String RFC_7591 = "https://datatracker.ietf.org/doc/html/rfc7591#section-3.2.2";

    private ConnectorClients() {}

    /** Sets the checks and the shape of a registered client on Spring's own provider. */
    static Consumer<List<AuthenticationProvider>> configure(RedirectUris redirectUris) {
        return providers -> providers.forEach(provider -> {
            if (provider instanceof OAuth2ClientRegistrationAuthenticationProvider registration) {
                registration.setAuthenticationValidator(validator(redirectUris));
                registration.setRegisteredClientConverter(ConnectorClients::registered);
            }
        });
    }

    static Consumer<OAuth2ClientRegistrationAuthenticationContext> validator(RedirectUris redirectUris) {
        Consumer<OAuth2ClientRegistrationAuthenticationContext> ours = context -> {
            OAuth2ClientRegistrationAuthenticationToken registration = context.getAuthentication();
            OAuth2ClientRegistration asked = registration.getClientRegistration();
            String name = asked.getClientName();
            if (name != null && name.length() > NAME_LIMIT) {
                throw refused("invalid_client_metadata", "client_name: at most " + NAME_LIMIT + " characters");
            }
            List<String> uris = asked.getRedirectUris();
            if (uris != null
                    && (uris.size() > REDIRECT_URIS_LIMIT
                            || uris.stream().anyMatch(uri -> uri.length() > REDIRECT_URI_LENGTH))) {
                throw refused(
                        OAuth2ErrorCodes.INVALID_REDIRECT_URI,
                        "redirect_uris: at most " + REDIRECT_URIS_LIMIT + ", each at most " + REDIRECT_URI_LENGTH
                                + " characters");
            }
            if (uris == null || uris.isEmpty() || !uris.stream().allMatch(redirectUris::allows)) {
                throw refused(
                        OAuth2ErrorCodes.INVALID_REDIRECT_URI,
                        "redirect_uris: only Claude's, ChatGPT's and a loopback callback may be registered");
            }
            List<String> scopes = asked.getScopes();
            if (scopes != null && !ConnectorSettings.SCOPES.containsAll(scopes)) {
                throw refused("invalid_client_metadata", "scope: only " + String.join(" ", ConnectorSettings.SCOPES));
            }
        };
        return OAuth2ClientRegistrationAuthenticationValidator.DEFAULT_REDIRECT_URI_VALIDATOR
                .andThen(OAuth2ClientRegistrationAuthenticationValidator.DEFAULT_SCOPE_VALIDATOR)
                .andThen(ours);
    }

    /** The client as registered: Spring's conversion for its id and
     *  name, the rest set here. */
    static RegisteredClient registered(OAuth2ClientRegistration asked) {
        RegisteredClient base = new OAuth2ClientRegistrationRegisteredClientConverter().convert(asked);
        List<String> scopes =
                asked.getScopes() == null || asked.getScopes().isEmpty() ? ConnectorSettings.SCOPES : asked.getScopes();
        return RegisteredClient.withId(base.getId())
                .clientId(base.getClientId())
                .clientIdIssuedAt(base.getClientIdIssuedAt())
                .clientName(asked.getClientName() == null ? "An AI app" : asked.getClientName())
                .clientAuthenticationMethod(ClientAuthenticationMethod.NONE)
                .authorizationGrantTypes(grants -> grants.addAll(
                        Set.of(AuthorizationGrantType.AUTHORIZATION_CODE, AuthorizationGrantType.REFRESH_TOKEN)))
                .redirectUris(registered -> registered.addAll(asked.getRedirectUris()))
                .scopes(granted -> granted.addAll(scopes))
                .clientSettings(ClientSettings.builder()
                        .requireProofKey(true)
                        .requireAuthorizationConsent(true)
                        .build())
                // A refresh token is used once (reuseRefreshTokens false):
                // for a public client, OAuth 2.1 asks refresh tokens to be
                // rotated, and Claude's docs ask the same of a server.
                .tokenSettings(TokenSettings.builder()
                        .accessTokenTimeToLive(ACCESS_TOKEN)
                        .refreshTokenTimeToLive(REFRESH_TOKEN)
                        .reuseRefreshTokens(false)
                        .build())
                .build();
    }

    private static OAuth2AuthenticationException refused(String code, String description) {
        return new OAuth2AuthenticationException(new OAuth2Error(code, description, RFC_7591));
    }
}
