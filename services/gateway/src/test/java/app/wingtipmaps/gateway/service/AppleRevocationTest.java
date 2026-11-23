package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.web.client.RestClient;

/**
 * What Apple is sent when a deleted pilot's refresh token is revoked, and
 * when the iOS app's authorization code is traded for one.
 */
class AppleRevocationTest {

    private HttpServer apple;
    private final List<String> asked = new CopyOnWriteArrayList<>();
    private volatile int answer = 200;
    /** Apple's answer to a code: its ID token names the Apple account. */
    private static String answerFor(String subject) {
        String idToken = new PlainJWT(new JWTClaimsSet.Builder()
                        .issuer("https://appleid.apple.com")
                        .subject(subject)
                        .build())
                .serialize();
        return "{\"access_token\":\"a\",\"refresh_token\":\"r.app\",\"id_token\":\"" + idToken + "\"}";
    }

    private volatile String tokenAnswer = answerFor("apple-sub-1");

    @BeforeEach
    void startApple() throws IOException {
        apple = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        apple.createContext("/auth/revoke", exchange -> {
            asked.add(exchange.getRequestMethod() + " "
                    + exchange.getRequestHeaders().getFirst("Content-Type") + " "
                    + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(answer, -1);
            exchange.close();
        });
        apple.createContext("/auth/token", exchange -> {
            asked.add("TOKEN " + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = tokenAnswer.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(answer, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        apple.start();
    }

    @AfterEach
    void stopApple() {
        apple.stop(0);
    }

    private AppleRevocation revocation(boolean configured) {
        Optional<InMemoryClientRegistrationRepository> registrations = Optional.of(
                configured
                        ? new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("apple")
                                .clientId("com.example.services")
                                .clientSecret("signed.jwt.secret")
                                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                                .redirectUri("http://localhost/cb")
                                .authorizationUri("https://example.com/a")
                                .tokenUri("https://example.com/t")
                                .build())
                        : new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("other")
                                .clientId("x")
                                .clientSecret("y")
                                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                                .redirectUri("http://localhost/cb")
                                .authorizationUri("https://example.com/a")
                                .tokenUri("https://example.com/t")
                                .build()));
        return new AppleRevocation(
                registrations.map(r -> r),
                RestClient.builder(),
                "http://127.0.0.1:" + apple.getAddress().getPort() + "/auth/revoke",
                "http://127.0.0.1:" + apple.getAddress().getPort() + "/auth/token",
                AppleAppTokensTest.app());
    }

    @Test
    void sendsTheTokenWithTheServicesIdAndSecretAsAForm() {
        revocation(true).revoke("r.refresh+token");

        assertThat(asked)
                .singleElement()
                .satisfies(sent -> assertThat(sent)
                        .startsWith("POST application/x-www-form-urlencoded")
                        .endsWith(" client_id=com.example.services&client_secret=signed.jwt.secret"
                                + "&token=r.refresh%2Btoken&token_type_hint=refresh_token"));
    }

    @Test
    void aPilotWithoutATokenAsksNothing() {
        revocation(true).revoke(null);
        revocation(true).revoke(" ");

        assertThat(asked).isEmpty();
    }

    @Test
    void withoutAppleConfiguredNothingIsSent() {
        revocation(false).revoke("token");

        assertThat(asked).isEmpty();
    }

    @Test
    void appleRefusingDoesNotRaise() {
        answer = 400;

        assertThatCode(() -> revocation(true).revoke("token")).doesNotThrowAnyException();
        assertThat(asked).hasSize(1);
    }

    @Test
    void theAppsTokenGoesWithTheBundleIdAndASecretSignedForIt() {
        revocation(true).revoke("app.refresh", "app.wingtipmaps.ios");

        assertThat(asked).singleElement().satisfies(sent -> {
            assertThat(sent)
                    .startsWith(
                            "POST application/x-www-form-urlencoded" + " client_id=app.wingtipmaps.ios&client_secret=");
            assertThat(sent).endsWith("&token=app.refresh&token_type_hint=refresh_token");
            assertThat(AppleAppTokensTest.secretSubject(sent)).isEqualTo("app.wingtipmaps.ios");
        });
    }

    @Test
    void aTokenForAnotherClientIsNotSentWithTheAppsSecret() {
        revocation(true).revoke("app.refresh", "com.someone.else");

        assertThat(asked).isEmpty();
    }

    // The iOS app's code traded for the token to revoke (5.1.1(v)).

    @Test
    void theAppsCodeIsTradedWithTheBundleIdForTheRefreshToken() {
        assertThat(revocation(true).tradeAppCode("c.code", "apple-sub-1")).contains("r.app");

        assertThat(asked).singleElement().satisfies(form -> {
            assertThat(form).startsWith("TOKEN client_id=app.wingtipmaps.ios&client_secret=");
            assertThat(form).endsWith("&code=c.code&grant_type=authorization_code");
            assertThat(AppleAppTokensTest.secretSubject(form)).isEqualTo("app.wingtipmaps.ios");
        });
    }

    @Test
    void noCodeOrNoAppClientAsksNothing() {
        assertThat(revocation(true).tradeAppCode(null, "apple-sub-1")).isEmpty();
        assertThat(revocation(true).tradeAppCode(" ", "apple-sub-1")).isEmpty();
        var unset = new AppleRevocation(
                Optional.empty(),
                RestClient.builder(),
                "http://127.0.0.1:" + apple.getAddress().getPort() + "/auth/revoke",
                "http://127.0.0.1:" + apple.getAddress().getPort() + "/auth/token",
                new AppleAppTokens("", "", "", "app.wingtipmaps.ios"));
        assertThat(unset.tradeAppCode("c.code", "apple-sub-1")).isEmpty();
        assertThat(asked).isEmpty();
    }

    @Test
    void appleRefusingTheCodeGivesNoTokenAndNoFault() {
        answer = 400;
        tokenAnswer = "{\"error\":\"invalid_grant\"}";
        assertThat(revocation(true).tradeAppCode("c.code", "apple-sub-1")).isEmpty();
        assertThat(asked).hasSize(1);
    }

    @Test
    void anAnswerWithoutARefreshTokenGivesNone() {
        tokenAnswer = "{\"access_token\":\"a\"}";
        assertThat(revocation(true).tradeAppCode("c.code", "apple-sub-1")).isEmpty();
    }

    /**
     * The deep security review of 2026-11-21: the code arrives beside the
     * identity token with nothing tying the two, so a code another Apple
     * account's was kept with this pilot, and deleting this account would
     * have revoked that one's grant. Only a code Apple answers with the
     * signing-in account's own ID token is kept.
     */
    @Test
    void aCodeAnotherAppleAccountsIsNotKept() {
        tokenAnswer = answerFor("someone-else");
        assertThat(revocation(true).tradeAppCode("c.code", "apple-sub-1")).isEmpty();
        tokenAnswer = "{\"access_token\":\"a\",\"refresh_token\":\"r.app\",\"id_token\":\"not-a-jwt\"}";
        assertThat(revocation(true).tradeAppCode("c.code", "apple-sub-1")).isEmpty();
        tokenAnswer = "{\"access_token\":\"a\",\"refresh_token\":\"r.app\"}";
        assertThat(revocation(true).tradeAppCode("c.code", "apple-sub-1")).isEmpty();
        tokenAnswer = answerFor("apple-sub-1");
        assertThat(revocation(true).tradeAppCode("c.code", null)).isEmpty();
        assertThat(revocation(true).tradeAppCode("c.code", "apple-sub-1")).contains("r.app");
    }
}
