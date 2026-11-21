package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.security.AppleClientSecret;
import java.time.Instant;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * The iOS app as a Sign in with Apple client: its bundle id and a client
 * secret signed for it. The app's sheet hands over an identity token, which
 * signs the pilot in (AppleNativeSignInController), and an authorization
 * code, which only this server can trade at Apple's /auth/token
 * (AppleRevocation.tradeAppCode) for the refresh token that deleting the
 * account revokes. Without the trade there is nothing to revoke, and
 * Apple's account deletion requirement for apps with Sign in with Apple
 * (App Review 5.1.1(v); Apple's "Revoke tokens",
 * developer.apple.com/documentation/sign_in_with_apple/revoke_tokens, and
 * TN3194) is not met for a pilot who signed in on the iPhone: the app would
 * stay in their Apple Account's "Sign in with Apple" list after the account
 * was gone.
 *
 * <p>The code was issued to the app's bundle id, so it is traded, and its
 * refresh token later revoked, with a client secret whose subject is the
 * bundle id (AppleClientSecret), not the web's Services ID.
 */
@Component
public class AppleAppTokens {

    private final String teamId;
    private final String keyId;
    private final String privateKey;
    private final String bundleId;

    @Autowired
    public AppleAppTokens(AppProperties app) {
        this(
                app.apple().teamId(),
                app.apple().keyId(),
                app.apple().privateKey(),
                app.ios().bundleId());
    }

    public AppleAppTokens(String teamId, String keyId, String privateKey, String bundleId) {
        this.teamId = teamId == null ? "" : teamId.trim();
        this.keyId = keyId == null ? "" : keyId.trim();
        this.privateKey = privateKey == null ? "" : privateKey;
        this.bundleId = bundleId == null ? "" : bundleId.trim();
    }

    /** The iOS app's client id at Apple: its bundle id. */
    public String clientId() {
        return bundleId;
    }

    /**
     * A client secret for the app's bundle id, where the team's key and the
     * bundle id are set; empty otherwise.
     *
     * @throws IllegalStateException when the key is set but cannot sign
     */
    public Optional<String> secret() {
        if (!StringUtils.hasText(teamId)
                || !StringUtils.hasText(keyId)
                || !StringUtils.hasText(privateKey)
                || !StringUtils.hasText(bundleId)) {
            return Optional.empty();
        }
        return Optional.of(AppleClientSecret.sign(teamId, keyId, privateKey, bundleId, Instant.now()));
    }
}
