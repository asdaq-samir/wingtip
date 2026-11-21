package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbusds.jwt.SignedJWT;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.InvalidAlgorithmParameterException;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.spec.ECGenParameterSpec;
import java.text.ParseException;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The iOS app as Apple's client: a secret signed by the team's key for the
 * bundle id, the one Apple trades and revokes the app's tokens with.
 */
class AppleAppTokensTest {

    static final String BUNDLE = "app.wingtipmaps.ios";

    /** The app's client with a freshly made P-256 key, as Apple's .p8 is. */
    static AppleAppTokens app() {
        return new AppleAppTokens("TEAM123456", "KEY1234567", pem(), BUNDLE);
    }

    static String pem() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            String body = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII))
                    .encodeToString(generator.generateKeyPair().getPrivate().getEncoded());
            return "-----BEGIN PRIVATE KEY-----\n" + body + "\n-----END PRIVATE KEY-----\n";
        } catch (NoSuchAlgorithmException | InvalidAlgorithmParameterException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The subject of the client secret in a form Apple was sent. */
    static String secretSubject(String form) {
        Matcher secret = Pattern.compile("client_secret=([^&]+)").matcher(form);
        assertThat(secret.find()).isTrue();
        try {
            return SignedJWT.parse(URLDecoder.decode(secret.group(1), StandardCharsets.UTF_8))
                    .getJWTClaimsSet()
                    .getSubject();
        } catch (ParseException e) {
            throw new AssertionError(e);
        }
    }

    @Test
    void theSecretIsTheTeamsForTheBundleIdToApple() throws ParseException {
        SignedJWT secret = SignedJWT.parse(app().secret().orElseThrow());

        assertThat(secret.getHeader().getAlgorithm().getName()).isEqualTo("ES256");
        assertThat(secret.getHeader().getKeyID()).isEqualTo("KEY1234567");
        assertThat(secret.getJWTClaimsSet().getIssuer()).isEqualTo("TEAM123456");
        assertThat(secret.getJWTClaimsSet().getSubject()).isEqualTo(BUNDLE);
        assertThat(secret.getJWTClaimsSet().getAudience()).containsExactly("https://appleid.apple.com");
        assertThat(app().clientId()).isEqualTo(BUNDLE);
    }

    @Test
    void withoutTheTeamsKeyOrTheBundleIdThereIsNoSecret() {
        assertThat(new AppleAppTokens("", "", "", BUNDLE).secret()).isEmpty();
        assertThat(new AppleAppTokens("TEAM123456", "KEY1234567", pem(), " ").secret()).isEmpty();
    }
}
