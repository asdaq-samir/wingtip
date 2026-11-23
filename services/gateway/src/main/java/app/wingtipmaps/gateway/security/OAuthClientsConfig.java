package app.wingtipmaps.gateway.security;

import app.wingtipmaps.gateway.config.AppProperties;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.util.StringUtils;

/**
 * Builds the OIDC client registrations sign-in actually uses -- Google
 * and Apple, whichever of the two have real credentials, as one
 * {@link ClientRegistrationRepository} bean rather than relying on
 * {@code spring.security.oauth2.client.registration.*} properties (the
 * declarative path Spring Boot's own auto-configuration reads). Google
 * would work declaratively; Apple cannot, which is the whole reason this
 * class exists at all.
 *
 * <p>{@code @Profile("oauth")}, same as the properties this used to
 * read from {@code application-oauth.yml}'s registration block did --
 * activation is still {@code SPRING_PROFILES_ACTIVE=oauth} plus real
 * credentials, just implemented in Java now instead of split across a
 * YAML file that could not express Apple's own client secret anyway.
 *
 * <p>Apple's client secret is not a fixed string the way Google's is --
 * it is a signed JWT (ES256, issued by the app itself) with a maximum
 * lifetime of six months, built here once at startup from four values
 * only Apple's own developer portal can produce ({@code APPLE_TEAM_ID},
 * {@code APPLE_KEY_ID}, {@code APPLE_SERVICES_ID} and the {@code .p8}
 * private key text), not minted or refreshed on a schedule -- a restart
 * well inside six months is what keeps it valid, which every deploy
 * already is. Apple has no userinfo endpoint at all, unlike Google;
 * {@code sub}/{@code email} come from the ID token directly, which is
 * all {@link app.wingtipmaps.gateway.service.PilotService} reads regardless
 * of which provider asserted them.
 */
@Configuration
@Profile("oauth")
public class OAuthClientsConfig {

    private final String googleClientId;
    private final String googleClientSecret;
    private final String appleTeamId;
    private final String appleKeyId;
    private final String appleServicesId;
    private final String applePrivateKeyPem;

    OAuthClientsConfig(AppProperties app) {
        String googleClientId = app.google().clientId();
        String googleClientSecret = app.google().clientSecret();
        String appleTeamId = app.apple().teamId();
        String appleKeyId = app.apple().keyId();
        String appleServicesId = app.apple().servicesId();
        String applePrivateKeyPem = app.apple().privateKey();
        this.googleClientId = googleClientId;
        this.googleClientSecret = googleClientSecret;
        this.appleTeamId = appleTeamId;
        this.appleKeyId = appleKeyId;
        this.appleServicesId = appleServicesId;
        this.applePrivateKeyPem = applePrivateKeyPem;
    }

    /**
     * Absent (no bean at all) when neither provider has real
     * credentials -- {@link SecurityConfig} reads this same
     * {@code Optional} to decide whether {@code oauth2Login()} is even
     * registered, the same fail-closed shape {@code googleConfigured}
     * used to check on its own.
     */
    @Bean
    ClientRegistrationRepository clientRegistrationRepository() {
        List<ClientRegistration> registrations = new ArrayList<>();
        if (StringUtils.hasText(googleClientId) && StringUtils.hasText(googleClientSecret)) {
            registrations.add(google());
        }
        if (StringUtils.hasText(appleTeamId)
                && StringUtils.hasText(appleKeyId)
                && StringUtils.hasText(appleServicesId)
                && StringUtils.hasText(applePrivateKeyPem)) {
            registrations.add(apple());
        }
        // An InMemoryClientRegistrationRepository with zero entries
        // still lets the app start, but /oauth2/authorization/{id}
        // would 404 for every id rather than the login button simply
        // not existing -- SecurityConfig's own oauth2Login() call is
        // what's actually conditional on this bean, via the Optional
        // it's injected with, so an empty list here is never reached in
        // practice; kept as a real (if unreachable) fallback rather
        // than throwing, since a config class failing to start is a
        // far worse failure mode than a registration nobody visits.
        return new InMemoryClientRegistrationRepository(registrations);
    }

    private ClientRegistration google() {
        return ClientRegistration.withRegistrationId("google")
                .clientId(googleClientId)
                .clientSecret(googleClientSecret)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "profile", "email")
                .authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .tokenUri("https://www.googleapis.com/oauth2/v4/token")
                .userInfoUri("https://www.googleapis.com/oauth2/v3/userinfo")
                .userNameAttributeName(IdTokenClaimNames.SUB)
                .jwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .issuerUri("https://accounts.google.com")
                .clientName("Google")
                .build();
    }

    private ClientRegistration apple() {
        return ClientRegistration.withRegistrationId("apple")
                .clientId(appleServicesId)
                .clientSecret(appleClientSecretJwt())
                // Apple requires the secret in the token request's own
                // body, not an Authorization: Basic header.
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                // "name" is real but only ever arrives once, in the
                // initial authorization POST body rather than the ID
                // token -- see PilotService's own comment on the
                // resulting display-name fallback. Requesting the scope
                // anyway costs nothing and is what Apple's own docs
                // show for every other client.
                .scope("openid", "email", "name")
                .authorizationUri("https://appleid.apple.com/auth/authorize")
                .tokenUri("https://appleid.apple.com/auth/token")
                // No userInfoUri -- Apple has none. Spring's own
                // OidcUserService only calls one when it's configured,
                // and both sub/email Apple ever asserts already arrive
                // on the ID token itself.
                .jwkSetUri("https://appleid.apple.com/auth/keys")
                // So the ID token's iss is checked, as Google's is: the
                // token comes from Apple's token endpoint, signed by Apple,
                // but nothing else said it was Apple's (round 4's L6).
                .issuerUri("https://appleid.apple.com")
                .userNameAttributeName(IdTokenClaimNames.SUB)
                .clientName("Apple")
                .build();
    }

    /** Signed once at startup (AppleClientSecret), not refreshed on a
     *  schedule: a restart inside its 150 days, which every deploy is,
     *  keeps it valid. A malformed APPLE_PRIVATE_KEY fails the bean at
     *  startup rather than at the first click. */
    private String appleClientSecretJwt() {
        return AppleClientSecret.sign(appleTeamId, appleKeyId, applePrivateKeyPem, appleServicesId, Instant.now());
    }
}
