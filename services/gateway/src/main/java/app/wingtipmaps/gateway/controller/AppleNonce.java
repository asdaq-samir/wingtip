package app.wingtipmaps.gateway.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The nonce that ties an Apple identity token to the sign-in it was asked
 * for (the security audit's L5, 2026-11-10): without one, a token that
 * leaked -- a log, a proxy -- signs its pilot in anywhere until it expires,
 * about ten minutes on.
 *
 * <p>The app asks for one (POST /api/auth/apple/native/nonce), which this
 * session keeps; it gives Apple the nonce's SHA-256 as lowercase hex
 * (ASAuthorizationAppleIDRequest.nonce, Apple's own "Authenticating users
 * with Sign in with Apple"), which Apple writes into the token's
 * {@code nonce} claim; and it sends the nonce itself with the token. Here
 * the nonce must be the one this session was given, used once, and its
 * hash the token's claim.
 */
final class AppleNonce {

    static final String ATTRIBUTE = AppleNonce.class.getName();

    private static final SecureRandom RANDOM = new SecureRandom();

    private AppleNonce() {}

    /** A new nonce for this session, replacing any it was given before. */
    static String issue(HttpServletRequest request) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String nonce = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        request.getSession(true).setAttribute(ATTRIBUTE, nonce);
        return nonce;
    }

    /**
     * Whether the token may sign in, as far as its nonce goes: with a nonce
     * sent, it must be this session's (spent here either way) and the
     * token's claim its hash. With none sent -- the app before it asks for
     * one -- only where none is required, and only for a token that names
     * none, since a token bound to a nonce must be shown with it.
     */
    static boolean checks(HttpServletRequest request, Jwt token, String sent, boolean required) {
        HttpSession session = request.getSession(false);
        Object issued = session == null ? null : session.getAttribute(ATTRIBUTE);
        if (session != null) {
            session.removeAttribute(ATTRIBUTE);
        }
        String claim = token.getClaimAsString("nonce");
        if (sent == null) {
            return !required && claim == null;
        }
        return issued instanceof String expected
                && MessageDigest.isEqual(
                        expected.getBytes(StandardCharsets.UTF_8), sent.getBytes(StandardCharsets.UTF_8))
                && claim != null
                && MessageDigest.isEqual(
                        sha256Hex(sent).getBytes(StandardCharsets.UTF_8), claim.getBytes(StandardCharsets.UTF_8));
    }

    static String sha256Hex(String value) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
