package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2RefreshToken;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;

/**
 * The MCP connection check's kept answers (waste-server audit D), with
 * the security audit's L4 kept: a live answer for at most a minute, never
 * past a token's own expiry, and forgotten at once on any change.
 */
class LiveConnectionsTest {

    private static final Instant NOW = Instant.parse("2026-11-21T12:00:00Z");

    private static LiveConnections at(Instant now) {
        return new LiveConnections(Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void aLiveAnswerIsKeptAMinuteAtMost() {
        LiveConnections kept = at(NOW);
        kept.live(7, "claude", "t-7", Instant.MAX, kept.changes());
        assertThat(kept.isLive(7, "claude", "t-7")).isTrue();
        assertThat(kept.isLive(7, "chatgpt", "t-7")).isFalse();
        assertThat(kept.isLive(8, "claude", "t-8")).isFalse();
        // A yes is for that token alone (the deep security review of 2026-11-21).
        assertThat(kept.isLive(7, "claude", "another")).isFalse();

        LiveConnections later = at(NOW.plus(LiveConnections.KEPT));
        later.live(7, "claude", "t-7", Instant.MAX, later.changes());
        assertThat(at(NOW).isLive(7, "claude", "t-7")).isFalse();
    }

    @Test
    void aLiveAnswerIsNeverKeptPastItsTokensOwnExpiry() {
        Instant[] now = {NOW};
        LiveConnections kept = new LiveConnections(new Clock() {
            @Override
            public java.time.ZoneId getZone() {
                return ZoneOffset.UTC;
            }

            @Override
            public Clock withZone(java.time.ZoneId zone) {
                return this;
            }

            @Override
            public Instant instant() {
                return now[0];
            }
        });
        kept.live(7, "claude", "t-7", NOW.plusSeconds(10), kept.changes());
        now[0] = NOW.plusSeconds(9);
        assertThat(kept.isLive(7, "claude", "t-7")).isTrue();
        now[0] = NOW.plusSeconds(10);
        assertThat(kept.isLive(7, "claude", "t-7")).isFalse();
    }

    @Test
    void aForgetEndsTheKeptAnswer_andOneReadAcrossAForgetIsNotKept() {
        LiveConnections kept = at(NOW);
        kept.live(7, "claude", "t-7", Instant.MAX, kept.changes());
        kept.live(8, "claude", "t-8", Instant.MAX, kept.changes());
        kept.forget("7");
        assertThat(kept.isLive(7, "claude", "t-7")).isFalse();
        assertThat(kept.isLive(8, "claude", "t-8")).isTrue();

        long seen = kept.changes();
        kept.forget("9"); // a revoke while the tables were being read
        kept.live(7, "claude", "t-7", Instant.MAX, seen);
        assertThat(kept.isLive(7, "claude", "t-7")).isFalse();
    }

    @Test
    void theGrantsAreReadOnceWhileKept_andAgainOnceARevokeForgetsThem() {
        Fixture f = new Fixture();
        assertThat(f.grants.live(7, "claude", "access-1")).isTrue();
        assertThat(f.grants.live(7, "claude", "access-1")).isTrue();
        verify(f.store, times(1)).findById("a-1");

        // Disconnected: /oauth2/revoke saves it with the token invalidated.
        OAuth2Authorization revoked =
                OAuth2Authorization.from(f.connection).invalidate(f.refresh).build();
        f.authorizations.save(revoked);
        given(f.store.findById("a-1")).willReturn(revoked);
        assertThat(f.grants.live(7, "claude", "access-1")).isFalse();
    }

    /**
     * The deep security review of 2026-11-21: the check asked whether the
     * pilot had any live connection through the client, so an access token
     * revoked while its refresh token stood, or one the pilot never held,
     * read as live. Only the very token presented, active, is a yes.
     */
    @Test
    void onlyTheVeryTokenPresented_stillActive_isLive() {
        Fixture f = new Fixture();
        assertThat(f.grants.live(7, "claude", "access-1")).isTrue();
        assertThat(f.grants.live(7, "claude", "made-up")).isFalse();
        assertThat(f.grants.live(7, "claude", null)).isFalse();
        assertThat(f.grants.live(8, "claude", "access-1")).isFalse();

        // The access token alone revoked: its refresh token still stands.
        OAuth2Authorization revoked =
                OAuth2Authorization.from(f.connection).invalidate(f.access).build();
        f.authorizations.save(revoked);
        given(f.store.findById("a-1")).willReturn(revoked);
        assertThat(revoked.getRefreshToken().isActive()).isTrue();
        assertThat(f.grants.live(7, "claude", "access-1")).isFalse();
    }

    /** One connection of pilot 7's through Claude, with an access and a refresh token. */
    private static final class Fixture {
        final JdbcOperations jdbc = mock(JdbcOperations.class);
        final OAuth2AuthorizationService store = mock(OAuth2AuthorizationService.class);
        final Instant now = Instant.now();
        final OAuth2RefreshToken refresh = new OAuth2RefreshToken("r-1", now, now.plusSeconds(3600));
        final OAuth2AccessToken access =
                new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "access-1", now, now.plusSeconds(900));
        final OAuth2Authorization connection;
        final LiveConnections kept = new LiveConnections();
        final RotatedRefreshTokens authorizations;
        final ConnectorGrants grants;

        Fixture() {
            given(jdbc.queryForList(anyString(), eq(String.class), eq("7"), eq("claude")))
                    .willReturn(List.of("a-1"));
            RegisteredClient client = RegisteredClient.withId("c-1")
                    .clientId("claude")
                    .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                    .redirectUri("https://claude.ai/api/mcp/auth_callback")
                    .build();
            connection = OAuth2Authorization.withRegisteredClient(client)
                    .id("a-1")
                    .principalName("7")
                    .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                    .accessToken(access)
                    .refreshToken(refresh)
                    .build();
            given(store.findById("a-1")).willReturn(connection);
            authorizations = new RotatedRefreshTokens(store, jdbc, kept);
            grants = new ConnectorGrants(jdbc, authorizations, kept);
        }
    }
}
