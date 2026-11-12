package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.config.AppProperties;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Ends the grant Apple gave this app for a pilot, as their account goes:
 * App Review's 5.1.1(v) expects an app that offers Sign in with Apple to
 * call Apple's token revocation (POST /auth/revoke, with the Services ID,
 * the signed client secret and the refresh token) when the account is
 * deleted. Apple hands the server a refresh token at every sign-in, so the
 * token is kept (Pilot.appleRefreshToken) for this.
 *
 * <p>Best effort: the account is deleted whatever Apple answers, since a
 * token Apple no longer knows (already revoked) must not make the account
 * undeletable. A failure is logged.
 */
@Service
public class AppleRevocation {

    private static final Logger log = LoggerFactory.getLogger(AppleRevocation.class);

    private final Optional<ClientRegistrationRepository> registrations;
    private final String revokeUrl;
    /** Boot's RestClient: its waits are spring.http.clients' (application.yml). */
    private final RestClient http;

    @Autowired
    public AppleRevocation(
            Optional<ClientRegistrationRepository> registrations, RestClient.Builder http, AppProperties app) {
        this(registrations, http, app.apple().revokeUrl());
    }

    public AppleRevocation(
            Optional<ClientRegistrationRepository> registrations, RestClient.Builder http, String revokeUrl) {
        this.registrations = registrations;
        this.http = http.build();
        this.revokeUrl = revokeUrl;
    }

    /** Revokes the refresh token; nothing to do for a pilot without one. */
    public void revoke(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return;
        }
        ClientRegistration apple =
                registrations.map(r -> r.findByRegistrationId("apple")).orElse(null);
        if (apple == null) {
            log.warn("A pilot's Apple token was kept but Sign in with Apple is not configured; not revoked");
            return;
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", apple.getClientId());
        form.add("client_secret", apple.getClientSecret());
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
}
