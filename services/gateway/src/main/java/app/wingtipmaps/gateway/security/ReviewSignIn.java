package app.wingtipmaps.gateway.security;

import app.wingtipmaps.gateway.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The store reviewers' way in. Apple's App Review and Google Play's App
 * access both need an account a reviewer can sign in to without help, and
 * this app's sign-in is an emailed link (Android has no other), whose
 * inbox a reviewer cannot read. With {@code app.review-sign-in.enabled}
 * on, the one review account ({@code app.review-sign-in.email}) may sign
 * in with a fixed code ({@code app.review-sign-in.code}) where a link's
 * one-time token goes: the reviewer opens
 * {@code https://<host>/api/auth/magic-link/verify?token=<code>} on the
 * device, which the apps open as they open any sign-in link
 * (docs/store/listing.md, "Review access").
 *
 * <p>Off by default, and refused at start when on without an address or
 * with a code shorter than {@link #SHORTEST_CODE}: a guessable code would
 * be a password anyone could use. The code signs in that account and no
 * other, is compared in constant time, and is never stored or logged.
 */
@Component
public class ReviewSignIn {

    /** The shortest code accepted, in base64url's own characters: 32 of
     *  them are 192 random bits, as `openssl rand -base64 24` makes (with
     *  + and / written - and _). 20 of any character let a short word
     *  pass (round 4's security review, L7). */
    static final int SHORTEST_CODE = 32;

    private static final java.util.regex.Pattern CODE =
            java.util.regex.Pattern.compile("[A-Za-z0-9_-]{" + SHORTEST_CODE + ",}");

    /** Review sign-in off: what a slice test without this bean has. */
    public static final ReviewSignIn OFF = new ReviewSignIn(false, "", "");

    private final boolean enabled;
    private final String email;
    private final byte[] code;

    @Autowired
    public ReviewSignIn(AppProperties app) {
        this(
                app.reviewSignIn().enabled(),
                app.reviewSignIn().email(),
                app.reviewSignIn().code());
    }

    public ReviewSignIn(boolean enabled, String email, String code) {
        if (enabled && (email.isBlank() || !CODE.matcher(code).matches())) {
            throw new IllegalStateException("REVIEW_SIGN_IN is on: REVIEW_SIGN_IN_EMAIL must be set and "
                    + "REVIEW_SIGN_IN_CODE at least " + SHORTEST_CODE + " letters, digits, - and _");
        }
        this.enabled = enabled;
        this.email = email.trim();
        this.code = code.getBytes(StandardCharsets.UTF_8);
    }

    /** The review account's address where `token` is its code and review sign-in is on; else none. */
    public Optional<String> accountFor(String token) {
        if (!enabled || token == null) {
            return Optional.empty();
        }
        return MessageDigest.isEqual(code, token.getBytes(StandardCharsets.UTF_8))
                ? Optional.of(email)
                : Optional.empty();
    }
}
