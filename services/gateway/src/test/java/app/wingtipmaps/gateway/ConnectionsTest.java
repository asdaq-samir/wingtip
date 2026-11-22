package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.ConnectionDto;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import app.wingtipmaps.gateway.security.mcp.ConnectorGrants;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * You's Connected Apps (ConnectionsController), against a real Postgres:
 * the pilot's connections listed, one ended with its tokens and the spent
 * ones, the consent kept while another connection through the app stands
 * and gone with the last, and nobody else's listed or ended (the deep
 * security review of 2026-11-21, N2).
 */
class ConnectionsTest extends AccountTestBase {

    @Autowired
    private ConnectorGrants grants;

    private Pilot pilot() {
        return pilots.save(new Pilot(UUID.randomUUID() + "@example.com", "Test Pilot", null, null));
    }

    private static RequestPostProcessor as(Pilot pilot) {
        return authentication(new MagicLinkAuthenticationToken(pilot.getEmail()));
    }

    private void client(String id, String name) {
        jdbc.update(
                "INSERT INTO oauth2_registered_client (id, client_id, client_id_issued_at, client_name,"
                        + " client_authentication_methods, authorization_grant_types, scopes, client_settings, token_settings)"
                        + " VALUES (?, ?, now(), ?, 'none', 'authorization_code', 'wingtip:read', '{}', '{}')"
                        + " ON CONFLICT DO NOTHING",
                id,
                id,
                name);
    }

    private String connection(Pilot pilot, String client) {
        String id = UUID.randomUUID().toString();
        jdbc.update(
                "INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type,"
                        + " authorized_scopes, access_token_value, access_token_issued_at, access_token_expires_at)"
                        + " VALUES (?, ?, ?, 'authorization_code', 'wingtip:read', ?, now(), now() + interval '15 minutes')",
                id,
                client,
                String.valueOf(pilot.getId()),
                "a-" + id);
        jdbc.update(
                "INSERT INTO oauth2_spent_refresh_token (token_hash, authorization_id) VALUES (?, ?)",
                (id + id).replace("-", "").substring(0, 64),
                id);
        return id;
    }

    private void consent(Pilot pilot, String client) {
        jdbc.update(
                "INSERT INTO oauth2_authorization_consent (registered_client_id, principal_name, authorities)"
                        + " VALUES (?, ?, 'SCOPE_wingtip:read')",
                client,
                String.valueOf(pilot.getId()));
    }

    private List<String> consents(Pilot pilot) {
        return jdbc.queryForList(
                "SELECT registered_client_id FROM oauth2_authorization_consent WHERE principal_name = ?",
                String.class,
                String.valueOf(pilot.getId()));
    }

    @Test
    void aConnectionIsListedAndEndedOneAtATime() throws Exception {
        client("claude-test", "Claude");
        Pilot pilot = pilot();
        Pilot other = pilot();
        String first = connection(pilot, "claude-test");
        String second = connection(pilot, "claude-test");
        String theirs = connection(other, "claude-test");
        consent(pilot, "claude-test");
        consent(other, "claude-test");

        mockMvc.perform(get("/api/me/connections").with(as(pilot)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].app").value("Claude"));

        // Another pilot's connection reads as none and stays.
        mockMvc.perform(delete("/api/me/connections/" + theirs).with(as(pilot)).with(csrf()))
                .andExpect(status().isNotFound());
        assertThat(grants.connections(other.getId())).hasSize(1);

        // One ended: its tokens and spent ones go, the consent stays for the other.
        mockMvc.perform(delete("/api/me/connections/" + first).with(as(pilot)).with(csrf()))
                .andExpect(status().isNoContent());
        assertThat(grants.connections(pilot.getId()))
                .extracting(ConnectionDto::id)
                .containsExactly(second);
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM oauth2_spent_refresh_token WHERE authorization_id = ?",
                        Long.class,
                        first))
                .isZero();
        assertThat(consents(pilot)).containsExactly("claude-test");

        // The last one ended: the consent goes with it, the other pilot's not.
        mockMvc.perform(delete("/api/me/connections/" + second).with(as(pilot)).with(csrf()))
                .andExpect(status().isNoContent());
        assertThat(grants.connections(pilot.getId())).isEmpty();
        assertThat(consents(pilot)).isEmpty();
        assertThat(consents(other)).containsExactly("claude-test");
    }

    @Test
    void nobodySignedOutListsOrEndsOne() throws Exception {
        mockMvc.perform(get("/api/me/connections")).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/me/connections/x").with(csrf())).andExpect(status().isUnauthorized());
    }
}
