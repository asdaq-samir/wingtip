package app.wingtipmaps.gateway.security.mcp;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.jwk.RSAKey;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The RSA key the connector's tokens are signed with (RS256), and its
 * public half at /oauth2/jwks for the planner to check them against.
 *
 * <p>From app.mcp.signing-key, a PKCS#8 PEM, so every gateway behind the
 * load balancer signs alike and a token outlives a restart. Without one, a
 * key is made at start: right for a machine of one's own, where a restart
 * only makes each connected client refresh (its refresh token is in
 * Postgres, not signed), and said in the log so no deployment runs so
 * unawares.
 */
final class SigningKey {

    private static final Logger log = LoggerFactory.getLogger(SigningKey.class);

    private SigningKey() {}

    static RSAKey of(String pem) {
        try {
            KeyPair pair = pem.isBlank() ? generated() : fromPem(pem);
            RSAKey key = new RSAKey.Builder((RSAPublicKey) pair.getPublic())
                    .privateKey(pair.getPrivate())
                    .build();
            // The key's id is its thumbprint (RFC 7638): the same key has
            // the same id on every gateway, and a new one a new id, which
            // is what tells the planner to read the key set again.
            return new RSAKey.Builder(key)
                    .keyID(key.computeThumbprint().toString())
                    .build();
        } catch (GeneralSecurityException | JOSEException | IllegalArgumentException e) {
            throw new IllegalStateException(
                    "app.mcp.signing-key (MCP_SIGNING_KEY) is not an RSA private key in PKCS#8 PEM", e);
        }
    }

    private static KeyPair generated() throws GeneralSecurityException {
        log.warn("MCP_SIGNING_KEY is not set: the connector's tokens are signed with a key made at start, "
                + "and do not survive a restart. Set it anywhere more than one gateway runs.");
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static KeyPair fromPem(String pem) throws GeneralSecurityException {
        String body = pem.replaceAll("-----(BEGIN|END) PRIVATE KEY-----", "").replaceAll("\\s", "");
        KeyFactory factory = KeyFactory.getInstance("RSA");
        RSAPrivateCrtKey privateKey = (RSAPrivateCrtKey) factory.generatePrivate(
                new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body)));
        RSAPublicKey publicKey = (RSAPublicKey)
                factory.generatePublic(new RSAPublicKeySpec(privateKey.getModulus(), privateKey.getPublicExponent()));
        return new KeyPair(publicKey, privateKey);
    }
}
