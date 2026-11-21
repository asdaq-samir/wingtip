package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.config.AppProperties;
import com.nimbusds.jwt.JWTParser;
import java.text.ParseException;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Apple's token endpoints for a pilot's Sign in with Apple grant: the iOS
 * app's authorization code traded for the refresh token kept
 * (tradeAppCode, POST /auth/token), and that grant ended as the account
 * goes (revoke).
 *
 * <p>Ends the grant Apple gave this app for a pilot, as their account goes:
 * App Review's 5.1.1(v) expects an app that offers Sign in with Apple to
 * call Apple's token revocation (POST /auth/revoke, with the Services ID,
 * the signed client secret and the refresh token) when the account is
 * deleted. Apple hands the server a refresh token at every web sign-in,
 * and the iOS app's authorization code is traded for one (tradeAppCode),
 * so the token is kept (Pilot.appleRefreshToken) for this, with the
 * client it was issued to (Pilot.appleTokenClient, V46): Apple revokes a
 * token only for that client, so the web's goes with the Services ID and
 * its secret and the app's with the bundle id and a secret signed for it.
 *
 * <p>Best effort: the account is deleted whatever Apple answers, since a
 * token Apple no longer knows (already revoked) must not make the account
 * undeletable. A failure is logged.
 */
@Service
public class AppleRevocation {

    private static final Logger log = LoggerFactory.getLogger(AppleRevocation.class);

    private final Optional<ClientRegistrationRepository> registrations;
    /** The iOS app's client, for a token its sign-in was given. */
    private final AppleAppTokens app;

    private final String revokeUrl;
    private final String tokenUrl;
    /** Boot's RestClient: its waits are spring.http.clients' (application.yml). */
    private final RestClient http;

    @Autowired
    public AppleRevocation(
            Optional<ClientRegistrationRepository> registrations,
            RestClient.Builder http,
            AppProperties props,
            AppleAppTokens app) {
        this(registrations, http, props.apple().revokeUrl(), props.apple().tokenUrl(), app);
    }

    public AppleRevocation(
            Optional<ClientRegistrationRepository> registrations,
            RestClient.Builder http,
            String revokeUrl,
            String tokenUrl,
            AppleAppTokens app) {
        this.registrations = registrations;
        this.http = http.build();
        this.revokeUrl = revokeUrl;
        this.tokenUrl = tokenUrl;
        this.app = app;
    }

    /**
     * The refresh token Apple gives for the iOS app's authorization code
     * (grant_type authorization_code, with the bundle id and a secret
     * signed for it; the code is good for five minutes and once), to be
     * kept for revoking. Empty where there is no code, the app's client is
     * not configured, or Apple refuses or cannot be reached; a sign-in
     * never fails for it. A failure is logged, never the code.
     *
     * <p>Kept only where the ID token Apple answers with is the signed-in
     * Apple account's ({@code subject}, the identity token's): the code
     * arrives beside the identity token but nothing ties the two, so a code
     * of another Apple account's would otherwise be kept with this pilot,
     * and deleting this account would revoke that one's grant (the deep
     * security review of 2026-11-21). The ID token comes straight from
     * Apple's token endpoint over TLS, which OpenID Connect Core 3.1.3.7
     * lets stand for its signature.
     */
    public Optional<String> tradeAppCode(String authorizationCode, String subject) {
        if (authorizationCode == null || authorizationCode.isBlank() || app == null) {
            return Optional.empty();
        }
        Optional<String> secret = appSecret();
        if (secret.isEmpty()) {
            log.warn("The iOS app sent Apple's authorization code but its client is not configured; not traded");
            return Optional.empty();
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", app.clientId());
        form.add("client_secret", secret.get());
        form.add("code", authorizationCode);
        form.add("grant_type", "authorization_code");
        try {
            Map<String, Object> answer = http.post()
                    .uri(tokenUrl)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, Object>>() {});
            Object token = answer == null ? null : answer.get("refresh_token");
            if (!(token instanceof String value) || value.isBlank()) {
                return Optional.empty();
            }
            if (subject == null || !subject.equals(subjectOf(answer.get("id_token")))) {
                log.warn("Apple traded the iOS app's code for another Apple account than the one signing in; not kept");
                return Optional.empty();
            }
            return Optional.of(value);
        } catch (RestClientException failed) {
            log.error("Apple refused or could not be reached to trade the iOS app's authorization code", failed);
            return Optional.empty();
        }
    }

    /** The subject of the ID token Apple's token endpoint answered, or null. */
    private static String subjectOf(Object idToken) {
        if (!(idToken instanceof String value)) {
            return null;
        }
        try {
            return JWTParser.parse(value).getJWTClaimsSet().getSubject();
        } catch (ParseException unreadable) {
            return null;
        }
    }

    /** Revokes a token the web's sign-in was given. */
    public void revoke(String refreshToken) {
        revoke(refreshToken, null);
    }

    /**
     * Revokes the refresh token with the client it was issued to: the iOS
     * app's bundle id, or the web's Services ID where {@code client} is
     * blank (a token kept before V46 was always the web's). Nothing to do
     * for a pilot without one.
     */
    public void revoke(String refreshToken, String client) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return;
        }
        String clientId;
        String secret;
        if (client != null && !client.isBlank()) {
            Optional<String> signed = app == null || !client.equals(app.clientId()) ? Optional.empty() : appSecret();
            if (signed.isEmpty()) {
                log.warn("A pilot's Apple token from the iOS app was kept but its client is not set; not revoked");
                return;
            }
            clientId = client;
            secret = signed.get();
        } else {
            ClientRegistration apple =
                    registrations.map(r -> r.findByRegistrationId("apple")).orElse(null);
            if (apple == null) {
                log.warn("A pilot's Apple token was kept but Sign in with Apple is not configured; not revoked");
                return;
            }
            clientId = apple.getClientId();
            secret = apple.getClientSecret();
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", clientId);
        form.add("client_secret", secret);
        form.add("token", refreshToken);
        form.add("token_type_hint", "refresh_token");
        try {
            http.post()
                    .uri(revokeUrl)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException failed) {
            log.error("Apple refused or could not be reached to revoke a deleted pilot's token", failed);
        }
    }

    /** The app's secret, or empty where its key cannot sign. */
    private Optional<String> appSecret() {
        try {
            return app.secret();
        } catch (IllegalStateException badKey) {
            log.error("Apple's client secret for the iOS app could not be signed", badKey);
            return Optional.empty();
        }
    }
}
