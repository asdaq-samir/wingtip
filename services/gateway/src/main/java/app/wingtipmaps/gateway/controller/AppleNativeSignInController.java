package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.security.SessionSignIn;
import app.wingtipmaps.gateway.security.SignInLanding;
import app.wingtipmaps.gateway.service.AppleAppTokens;
import app.wingtipmaps.gateway.service.AppleRevocation;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.UnverifiedEmailException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sign in with Apple from the iOS app (apps/ios/), the native way: the
 * app's Apple sheet hands the page an identity token, and this checks
 * it -- Apple's signature (its published keys), Apple as the issuer, this
 * app's bundle id as the audience, not expired -- and signs the pilot in
 * on this session, as the web's own Apple sign-in does (the same pilot,
 * found by Apple's subject, PilotService.fromOidcUser). The sheet's
 * authorization code, where the app sends it, is traded for the refresh
 * token that deleting the account revokes (AppleRevocation.tradeAppCode,
 * App Review 5.1.1(v)). The web view
 * cannot use the web flow: Apple's page does not load inside an app's
 * app-bound web view, and App Review expects the native sheet.
 *
 * <p>Without APP_IOS_BUNDLE_ID there is no app whose tokens to accept,
 * and this answers 404.
 */
@RestController
@RequestMapping("/api/auth/apple/native")
public class AppleNativeSignInController {

    static final String APPLE = "https://appleid.apple.com";

    private final PilotService pilots;
    private final JwtDecoder decoder;
    /** Whether a token must come with its nonce (AppleNonce): off until
     *  the app sends one, then on (APP_APPLE_REQUIRE_NONCE). */
    private final boolean requireNonce;
    /** Trades the sheet's authorization code; null where none is traded. */
    private final @Nullable AppleRevocation appleGrants;
    /** The app's client at Apple, which the traded token is kept under. */
    private final @Nullable AppleAppTokens appClient;

    @Autowired
    public AppleNativeSignInController(
            PilotService pilots, AppProperties app, AppleRevocation appleGrants, AppleAppTokens appClient) {
        this(
                pilots,
                app.ios().bundleId().isBlank()
                        ? null
                        : appleTokens(app.ios().bundleId().trim()),
                app.apple().requireNonce(),
                appleGrants,
                appClient);
    }

    AppleNativeSignInController(PilotService pilots, JwtDecoder decoder) {
        this(pilots, decoder, false);
    }

    AppleNativeSignInController(PilotService pilots, JwtDecoder decoder, boolean requireNonce) {
        this(pilots, decoder, requireNonce, null, null);
    }

    AppleNativeSignInController(
            PilotService pilots,
            JwtDecoder decoder,
            boolean requireNonce,
            @Nullable AppleRevocation appleGrants,
            @Nullable AppleAppTokens appClient) {
        this.pilots = pilots;
        this.decoder = decoder;
        this.requireNonce = requireNonce;
        this.appleGrants = appleGrants;
        this.appClient = appClient;
    }

    /** Apple's identity tokens for this app alone. */
    static JwtDecoder appleTokens(String bundleId) {
        NimbusJwtDecoder decoder =
                NimbusJwtDecoder.withJwkSetUri(APPLE + "/auth/keys").build();
        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(APPLE), forApp(bundleId)));
        return decoder;
    }

    /** A token issued to this app (its bundle id the audience), not to
     *  another app or to the web's own Services ID. */
    static OAuth2TokenValidator<Jwt> forApp(String bundleId) {
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(bundleId)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "not this app's token", null));
    }

    /** What the app's Apple sheet answered: the identity token, the nonce
     *  it was asked with (AppleNonce), and the authorization code
     *  (ASAuthorizationAppleIDCredential.authorizationCode) traded for the
     *  token deleting the account revokes; an app before either leaves
     *  them out. */
    public record AppleToken(
            @Nullable @Size(max = 2000) String authorizationCode,
            @NotBlank @Size(max = 8000) String identityToken,
            @Nullable @Size(max = 200) String nonce) {

        public AppleToken(String identityToken) {
            this(null, identityToken, null);
        }

        public AppleToken(String identityToken, @Nullable String nonce) {
            this(null, identityToken, nonce);
        }
    }

    /** A nonce for this session's next Apple sign-in. */
    public record AppleNonceAnswer(String nonce) {}

    @Operation(
            summary = "A nonce for Sign in with Apple from the iOS app",
            description = "Kept by this session, used once. Give Apple its SHA-256 as lowercase hex "
                    + "(ASAuthorizationAppleIDRequest.nonce), then send it as `nonce` with the identity token.")
    @PostMapping("/nonce")
    public AppleNonceAnswer nonce(HttpServletRequest request) {
        return new AppleNonceAnswer(AppleNonce.issue(request));
    }

    /** Signed in: where the app goes next (SignInLanding). */
    public record SignedIn(String next) {}

    @Operation(
            summary = "Sign in with Apple from the iOS app",
            description = "Checks the native sheet's identity token (Apple's keys, issuer, this app's bundle id, "
                    + "and its nonce where one is sent) and signs the pilot in on this session; an authorization "
                    + "code sent with it is traded for the refresh token deleting the account revokes. 404 where "
                    + "no iOS app is set up.")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "Signed in; `next` is where to go",
                content = @Content(schema = @Schema(implementation = SignedIn.class))),
        @ApiResponse(responseCode = "401", description = "Not a token Apple issued to this app, or no verified email"),
        @ApiResponse(responseCode = "404", description = "No iOS app set up here")
    })
    @PostMapping
    public ResponseEntity<?> signIn(
            @Valid @RequestBody AppleToken body, HttpServletRequest request, HttpServletResponse response) {
        if (decoder == null) {
            return ResponseEntity.of(ProblemDetail.forStatusAndDetail(
                            HttpStatus.NOT_FOUND, "Sign in with Apple is not set up for the app here."))
                    .build();
        }
        Jwt jwt;
        try {
            jwt = decoder.decode(body.identityToken());
        } catch (JwtException refused) {
            return ResponseEntity.of(ProblemDetail.forStatusAndDetail(
                            HttpStatus.UNAUTHORIZED, "Apple's sign-in could not be confirmed. Try again."))
                    .build();
        }
        if (!AppleNonce.checks(request, jwt, body.nonce(), requireNonce)) {
            return ResponseEntity.of(ProblemDetail.forStatusAndDetail(
                            HttpStatus.UNAUTHORIZED, "Apple's sign-in could not be confirmed. Try again."))
                    .build();
        }
        OidcUser user = new DefaultOidcUser(
                List.of(new SimpleGrantedAuthority("OIDC_USER")),
                new OidcIdToken(jwt.getTokenValue(), jwt.getIssuedAt(), jwt.getExpiresAt(), jwt.getClaims()),
                "sub");
        Pilot pilot;
        try {
            pilot = pilots.fromOidcUser(user, "apple");
        } catch (UnverifiedEmailException | IllegalArgumentException refused) {
            return ResponseEntity.of(ProblemDetail.forStatusAndDetail(
                            HttpStatus.UNAUTHORIZED,
                            "Apple did not share a verified email address, which an account here needs."))
                    .build();
        }
        keepRefreshToken(pilot, body.authorizationCode());
        Authentication authentication = new OAuth2AuthenticationToken(user, user.getAuthorities(), "apple");
        SessionSignIn.signIn(authentication, request, response);
        return ResponseEntity.ok(new SignedIn(SignInLanding.after(pilot)));
    }

    /** The sheet's code traded for Apple's refresh token and kept with
     *  the pilot, best effort: the sign-in stands whatever Apple says. */
    private void keepRefreshToken(Pilot pilot, @Nullable String authorizationCode) {
        if (appleGrants == null || appClient == null || authorizationCode == null || authorizationCode.isBlank()) {
            return;
        }
        appleGrants
                .tradeAppCode(authorizationCode)
                .ifPresent(token -> pilots.keepAppleRefreshToken(pilot, token, appClient.clientId()));
    }
}
