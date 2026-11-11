package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.UnverifiedEmailException;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

/**
 * Sign in with Apple from the iOS app: a token Apple issued to this app
 * signs its pilot in on the session, as the web's Apple sign-in would;
 * anything else signs nobody in.
 */
class AppleNativeSignInControllerTest {

    // Signing in here sets the thread's security context (SessionSignIn),
    // and with the controller called outside the filter chain nothing
    // clears it: left behind, it signed in every later MockMvc request on
    // the thread -- the anonymous reader of the speed trend got 403, not
    // 401 (SpeedControllerTest, in CI's run of the whole suite).
    @AfterEach
    void signOutOfThisThread() {
        SecurityContextHolder.clearContext();
    }

    private static Jwt token(String audience) {
        return token(audience, null);
    }

    private static Jwt token(String audience, String nonceClaim) {
        return Jwt.withTokenValue("apple-token")
                .claims(claims -> {
                    if (nonceClaim != null) {
                        claims.put("nonce", nonceClaim);
                    }
                })
                .header("alg", "RS256")
                .issuer("https://appleid.apple.com")
                .audience(List.of(audience))
                .subject("apple-sub-1")
                .claim("email", "pilot@example.com")
                .claim("email_verified", "true")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(600))
                .build();
    }

    @Test
    void appleTokenForThisAppSignsItsPilotInOnTheSession() {
        PilotService pilots = mock(PilotService.class);
        given(pilots.fromOidcUser(any(OidcUser.class), eq("apple")))
                .willReturn(new Pilot("pilot@example.com", "A Pilot", null, "apple-sub-1"));
        JwtDecoder decoder = value -> token("app.wingtipmaps.ios");
        MockHttpServletRequest request = new MockHttpServletRequest();

        var answer = new AppleNativeSignInController(pilots, decoder)
                .signIn(
                        new AppleNativeSignInController.AppleToken("apple-token"),
                        request,
                        new MockHttpServletResponse());

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        SecurityContext context = (SecurityContext)
                request.getSession().getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        OAuth2AuthenticationToken signedIn = (OAuth2AuthenticationToken) context.getAuthentication();
        assertThat(signedIn.getAuthorizedClientRegistrationId()).isEqualTo("apple");
        assertThat(signedIn.getName()).isEqualTo("apple-sub-1");
    }

    @Test
    void aTokenAppleDidNotIssueSignsNobodyIn() {
        JwtDecoder decoder = value -> {
            throw new BadJwtException("signature");
        };
        MockHttpServletRequest request = new MockHttpServletRequest();
        var answer = new AppleNativeSignInController(mock(PilotService.class), decoder)
                .signIn(new AppleNativeSignInController.AppleToken("forged"), request, new MockHttpServletResponse());
        assertThat(answer.getStatusCode().value()).isEqualTo(401);
        assertThat(request.getSession(false)).isNull();
    }

    @Test
    void anUnverifiedAddressSignsNobodyIn() {
        PilotService pilots = mock(PilotService.class);
        given(pilots.fromOidcUser(any(OidcUser.class), eq("apple")))
                .willThrow(new UnverifiedEmailException("pilot@example.com"));
        var answer = new AppleNativeSignInController(pilots, value -> token("app.wingtipmaps.ios"))
                .signIn(
                        new AppleNativeSignInController.AppleToken("apple-token"),
                        new MockHttpServletRequest(),
                        new MockHttpServletResponse());
        assertThat(answer.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void withNoAppThereIsNoNativeSignIn() {
        var answer = new AppleNativeSignInController(mock(PilotService.class), (JwtDecoder) null)
                .signIn(
                        new AppleNativeSignInController.AppleToken("apple-token"),
                        new MockHttpServletRequest(),
                        new MockHttpServletResponse());
        assertThat(answer.getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void onlyThisAppsAudienceIsAccepted() {
        var validator = AppleNativeSignInController.forApp("app.wingtipmaps.ios");
        assertThat(validator.validate(token("app.wingtipmaps.ios")).hasErrors()).isFalse();
        assertThat(validator.validate(token("com.someone.else")).hasErrors()).isTrue();
    }

    private static int signIn(AppleNativeSignInController controller, MockHttpServletRequest request, String nonce) {
        return controller
                .signIn(
                        new AppleNativeSignInController.AppleToken("apple-token", nonce),
                        request,
                        new MockHttpServletResponse())
                .getStatusCode()
                .value();
    }

    private static PilotService aPilot() {
        PilotService pilots = mock(PilotService.class);
        given(pilots.fromOidcUser(any(OidcUser.class), eq("apple")))
                .willReturn(new Pilot("pilot@example.com", "A Pilot", null, "apple-sub-1"));
        return pilots;
    }

    /** L5: the session's nonce, sent with a token whose claim is its hash,
     *  signs in once; another nonce, a replay, or a claim that does not
     *  match signs nobody in. */
    @Test
    void aNonceThisSessionWasGivenSignsInOnce() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        var probe = new AppleNativeSignInController(aPilot(), value -> token("app.wingtipmaps.ios"));
        String nonce = probe.nonce(request).nonce();
        String hashed = AppleNonce.sha256Hex(nonce);
        var controller = new AppleNativeSignInController(aPilot(), value -> token("app.wingtipmaps.ios", hashed), true);

        assertThat(signIn(controller, request, nonce)).isEqualTo(200);
        // Spent: the same token and nonce again, on a session that kept nothing.
        assertThat(signIn(controller, request, nonce)).isEqualTo(401);

        MockHttpServletRequest other = new MockHttpServletRequest();
        probe.nonce(other);
        assertThat(signIn(controller, other, nonce)).isEqualTo(401);
    }

    @Test
    void aTokenBoundToANonceNeedsIt() {
        var controller = new AppleNativeSignInController(
                aPilot(), value -> token("app.wingtipmaps.ios", AppleNonce.sha256Hex("n")));
        assertThat(signIn(controller, new MockHttpServletRequest(), null)).isEqualTo(401);
    }

    @Test
    void anAppSendingNoNonceSignsInUntilOneIsRequired() {
        JwtDecoder decoder = value -> token("app.wingtipmaps.ios");
        assertThat(signIn(
                        new AppleNativeSignInController(aPilot(), decoder, false), new MockHttpServletRequest(), null))
                .isEqualTo(200);
        assertThat(signIn(new AppleNativeSignInController(aPilot(), decoder, true), new MockHttpServletRequest(), null))
                .isEqualTo(401);
    }
}
