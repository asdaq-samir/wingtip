package app.wingtipmaps.gateway.security.mcp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;

/**
 * Spring's store of connections, with a rotated-away refresh token
 * remembered: each is used once (ConnectorClients), and one presented
 * again was copied -- the client and whoever copied it cannot both be
 * right -- so the whole connection is revoked, every token of it, and the
 * pilot's AI app asks them to connect again (OAuth 2.1 section 4.3.1;
 * RFC 9700 section 4.14.2; the security audit's L3, 2026-11-10). Spring
 * only refuses the old token (invalid_grant) and leaves the new one live.
 *
 * <p>Kept as SHA-256 hashes (V42), as the magic links are: nothing here
 * can be presented.
 */
final class RotatedRefreshTokens implements OAuth2AuthorizationService {

    private static final Logger log = LoggerFactory.getLogger(RotatedRefreshTokens.class);

    private final OAuth2AuthorizationService store;
    private final JdbcOperations jdbc;

    RotatedRefreshTokens(OAuth2AuthorizationService store, JdbcOperations jdbc) {
        this.store = store;
        this.jdbc = jdbc;
    }

    @Override
    public void save(OAuth2Authorization authorization) {
        OAuth2Authorization before = store.findById(authorization.getId());
        String spent = valueOf(before == null ? null : before.getRefreshToken());
        if (spent != null && !spent.equals(valueOf(authorization.getRefreshToken()))) {
            jdbc.update(
                    "INSERT INTO oauth2_spent_refresh_token (token_hash, authorization_id) VALUES (?, ?)"
                            + " ON CONFLICT (token_hash) DO NOTHING",
                    hash(spent),
                    authorization.getId());
        }
        store.save(authorization);
    }

    @Override
    public void remove(OAuth2Authorization authorization) {
        store.remove(authorization);
        jdbc.update("DELETE FROM oauth2_spent_refresh_token WHERE authorization_id = ?", authorization.getId());
    }

    @Override
    public OAuth2Authorization findById(String id) {
        return store.findById(id);
    }

    @Override
    public OAuth2Authorization findByToken(String token, OAuth2TokenType tokenType) {
        OAuth2Authorization found = store.findByToken(token, tokenType);
        if (found == null && (tokenType == null || OAuth2TokenType.REFRESH_TOKEN.equals(tokenType))) {
            revokeIfReplayed(token);
        }
        return found;
    }

    /** A spent refresh token presented again: its connection goes. */
    private void revokeIfReplayed(String token) {
        List<String> ids = jdbc.queryForList(
                "SELECT authorization_id FROM oauth2_spent_refresh_token WHERE token_hash = ?",
                String.class,
                hash(token));
        for (String id : ids) {
            OAuth2Authorization connection = store.findById(id);
            if (connection != null) {
                log.warn(
                        "connector: a spent refresh token was presented again; connection {} of pilot {} revoked",
                        id,
                        connection.getPrincipalName());
                remove(connection);
            }
        }
    }

    private static String valueOf(OAuth2Authorization.Token<OAuth2RefreshToken> token) {
        return token == null ? null : token.getToken().getTokenValue();
    }

    static String hash(String token) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
