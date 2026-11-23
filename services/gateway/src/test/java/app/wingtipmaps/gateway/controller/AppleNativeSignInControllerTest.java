package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.service.AppleAppTokens;
import app.wingtipmaps.gateway.service.AppleRevocation;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.UnverifiedEmailException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
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
import org.springframework.web.server.ResponseStatusException;

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

    /** 5.1.1(v): the sheet's authorization code is traded for Apple's
     *  refresh token, kept with the pilot under the app's client so that
     *  deleting the account can revoke it; without a code nothing is. */
    @Test
    void theSheetsCodeIsTradedAndKeptForRevokingLater() {
        PilotService pilots = aPilot();
        AppleRevocation apple = mock(AppleRevocation.class);
        given(apple.tradeAppCode("c.code", "apple-sub-1")).willReturn(Optional.of("r.app"));
        AppleAppTokens app = mock(AppleAppTokens.class);
        given(app.clientId()).willReturn("app.wingtipmaps.ios");
        var controller =
                new AppleNativeSignInController(pilots, value -> token("app.wingtipmaps.ios"), false, apple, app);

        var answer = controller.signIn(
                new AppleNativeSignInController.AppleToken("c.code", "apple-token", null),
                new MockHttpServletRequest(),
                new MockHttpServletResponse());

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        verify(pilots).keepAppleRefreshToken(any(Pilot.class), eq("r.app"), eq("app.wingtipmaps.ios"));
    }

    @Test
    void aTradeAppleRefusesStillSignsIn() {
        PilotService pilots = aPilot();
        AppleRevocation apple = mock(AppleRevocation.class);
        given(apple.tradeAppCode("c.code", "apple-sub-1")).willReturn(Optional.empty());
        var controller = new AppleNativeSignInController(
                pilots, value -> token("app.wingtipmaps.ios"), false, apple, mock(AppleAppTokens.class));

        var answer = controller.signIn(
                new AppleNativeSignInController.AppleToken("c.code", "apple-token", null),
                new MockHttpServletRequest(),
                new MockHttpServletResponse());

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        verify(pilots, never()).keepAppleRefreshToken(any(Pilot.class), any(), any());
    }

    /** The deep security review of 2026-11-21: each nonce is a session kept
     *  30 days, on a route open to anyone, so a client may ask for
     *  NONCES_PER_HOUR an hour and is then refused, 429, with no session made. */
    @Test
    void aClientAsksForSoManyNoncesAnHour() {
        var controller = new AppleNativeSignInController(aPilot(), value -> token("app.wingtipmaps.ios"));
        for (int i = 0; i < AppleNativeSignInController.NONCES_PER_HOUR; i++) {
            assertThat(controller.nonce(new MockHttpServletRequest()).nonce()).isNotBlank();
        }
        MockHttpServletRequest past = new MockHttpServletRequest();
        assertThatThrownBy(() -> controller.nonce(past))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(429));
        assertThat(past.getSession(false)).isNull();

        MockHttpServletRequest another = new MockHttpServletRequest();
        another.setRemoteAddr("192.0.2.7");
        assertThat(controller.nonce(another).nonce()).isNotBlank();
    }
}
