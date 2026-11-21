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
        kept.live(7, "claude", Instant.MAX, kept.changes());
        assertThat(kept.isLive(7, "claude")).isTrue();
        assertThat(kept.isLive(7, "chatgpt")).isFalse();
        assertThat(kept.isLive(8, "claude")).isFalse();

        LiveConnections later = at(NOW.plus(LiveConnections.KEPT));
        later.live(7, "claude", Instant.MAX, later.changes());
        assertThat(at(NOW).isLive(7, "claude")).isFalse();
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
        kept.live(7, "claude", NOW.plusSeconds(10), kept.changes());
        now[0] = NOW.plusSeconds(9);
        assertThat(kept.isLive(7, "claude")).isTrue();
        now[0] = NOW.plusSeconds(10);
        assertThat(kept.isLive(7, "claude")).isFalse();
    }

    @Test
    void aForgetEndsTheKeptAnswer_andOneReadAcrossAForgetIsNotKept() {
        LiveConnections kept = at(NOW);
        kept.live(7, "claude", Instant.MAX, kept.changes());
        kept.live(8, "claude", Instant.MAX, kept.changes());
        kept.forget("7");
        assertThat(kept.isLive(7, "claude")).isFalse();
        assertThat(kept.isLive(8, "claude")).isTrue();

        long seen = kept.changes();
        kept.forget("9"); // a revoke while the tables were being read
        kept.live(7, "claude", Instant.MAX, seen);
        assertThat(kept.isLive(7, "claude")).isFalse();
    }

    @Test
    void theGrantsAreReadOnceWhileKept_andAgainOnceARevokeForgetsThem() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        given(jdbc.queryForList(anyString(), eq(String.class), eq("7"), eq("claude")))
                .willReturn(List.of("a-1"));
        RegisteredClient client = RegisteredClient.withId("c-1")
                .clientId("claude")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("https://claude.ai/api/mcp/auth_callback")
                .build();
        Instant now = Instant.now();
        OAuth2RefreshToken refresh = new OAuth2RefreshToken("r-1", now, now.plusSeconds(3600));
        OAuth2Authorization connection = OAuth2Authorization.withRegisteredClient(client)
                .id("a-1")
                .principalName("7")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .refreshToken(refresh)
                .build();
        OAuth2AuthorizationService store = mock(OAuth2AuthorizationService.class);
        given(store.findById("a-1")).willReturn(connection);
        LiveConnections kept = new LiveConnections();
        RotatedRefreshTokens authorizations = new RotatedRefreshTokens(store, jdbc, kept);
        ConnectorGrants grants = new ConnectorGrants(jdbc, authorizations, kept);

        assertThat(grants.live(7, "claude")).isTrue();
        assertThat(grants.live(7, "claude")).isTrue();
        verify(store, times(1)).findById("a-1");

        // Disconnected: /oauth2/revoke saves it with the token invalidated.
        OAuth2Authorization revoked = OAuth2Authorization.from(connection).invalidate(refresh).build();
        authorizations.save(revoked);
        given(store.findById("a-1")).willReturn(revoked);
        assertThat(grants.live(7, "claude")).isFalse();
    }
}
