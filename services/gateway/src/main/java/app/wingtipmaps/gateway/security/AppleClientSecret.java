package app.wingtipmaps.gateway.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.interfaces.ECPrivateKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import org.springframework.boot.ssl.pem.PemContent;

/**
 * The client secret Apple asks of a Sign in with Apple client: a JWT
 * signed with the team's .p8 key (ES256), issued by the team, its subject
 * the client it speaks for, its audience Apple (Apple's "Creating a client
 * secret", developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret).
 * One key signs for both of this team's clients: the web's Services ID
 * (OAuthClientsConfig) and the iOS app's bundle id (AppleAppTokens), whose
 * tokens Apple only exchanges or revokes with a secret naming that same
 * client.
 */
public final class AppleClientSecret {

    /** Apple's own audience for every client secret. */
    static final String AUDIENCE = "https://appleid.apple.com";

    /** Comfortably inside Apple's six-month ceiling: a secret signed at
     *  startup stays good across a long gap between deploys. */
    static final long DAYS = 150;

    private AppleClientSecret() {}

    /**
     * The secret for {@code clientId}, signed now.
     *
     * @throws IllegalStateException when the key is not an EC key in PEM
     *     or cannot sign: a configuration fault, said at once
     */
    public static String sign(String teamId, String keyId, String privateKeyPem, String clientId, Instant now) {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(teamId)
                .subject(clientId)
                .audience(AUDIENCE)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(DAYS, ChronoUnit.DAYS)))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(keyId).build(), claims);
        try {
            jwt.sign(new ECDSASigner(privateKey(privateKeyPem)));
        } catch (JOSEException | IllegalArgumentException e) {
            throw new IllegalStateException("Could not sign Apple's client-secret JWT -- check APPLE_PRIVATE_KEY", e);
        }
        return jwt.serialize();
    }

    /** The .p8 key Apple gives, PKCS#8 PEM with its line breaks, read by
     *  Boot's own PEM reader. */
    static ECPrivateKey privateKey(String pemText) {
        PemContent pem = PemContent.of(pemText);
        if (pem == null || !(pem.getPrivateKey() instanceof ECPrivateKey key)) {
            throw new IllegalArgumentException("APPLE_PRIVATE_KEY is not an EC private key in PEM");
        }
        return key;
    }
}
