package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.security.mcp.ConnectorFlowSteps.Connected;
import app.wingtipmaps.gateway.service.PilotService;
import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * What a pilot's consent to an AI app grants, end to end against a real
 * Postgres: a saved flight changed only with wingtip:flights on the very
 * token (round 4's security review, the old L4's defence in depth), a
 * connection ended by its own client at /oauth2/revoke (L1), an
 * authorization never finished let go (L2), and a deleted account's
 * connections forgotten.
 */
@SpringBootTest(
        properties = {
            "app.public-base-url=http://localhost",
            "app.mcp.enabled=true",
            "app.mcp.internal-token=" + ConnectorRecordsTest.TOKEN
        })
@AutoConfigureMockMvc
@Testcontainers
class ConnectorGrantsTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    private static final String FLIGHT = "{\"departureIdent\":\"C81\",\"destinationIdent\":\"KDLH\"}";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private PilotService pilots;

    @Autowired
    private FindByIndexNameSessionRepository<? extends Session> sessions;

    @Autowired
    private JdbcOperations jdbc;

    @Autowired
    private ConnectorGrants grants;

    @Autowired
    private ConnectorHousekeeping housekeeping;

    private ConnectorFlowSteps steps;

    @BeforeEach
    void steps() {
        steps = new ConnectorFlowSteps(mvc, pilots, sessions);
    }

    /** A flight saved as the planner's save_flight saves one, as `who`, with `token`. */
    private ResultActions save(Connected who, String token) throws Exception {
        var request = ConnectorRecordsTest.asPilot(
                        post("/internal/mcp/flights"),
                        String.valueOf(who.pilot().getId()))
                .content(FLIGHT);
        return mvc.perform(token == null ? request : request.header("X-Connector-Token", token));
    }

    private ResultActions refresh(Connected who, String refreshToken) throws Exception {
        return mvc.perform(post("/oauth2/token")
                .param("grant_type", "refresh_token")
                .param("refresh_token", refreshToken)
                .param("client_id", who.clientId()));
    }

    private ResultActions live(Connected who, String access) throws Exception {
        return mvc.perform(ConnectorRecordsTest.internal(get("/internal/mcp/connection"))
                .header("X-Internal-Token", ConnectorRecordsTest.TOKEN)
                .header("X-Pilot-Id", String.valueOf(who.pilot().getId()))
                .header("X-Client-Id", who.clientId())
                .header("X-Connector-Token", access));
    }

    @Test
    void onlyATokenGrantedFlightsChangesThem() throws Exception {
        Connected writer = steps.connect(ConnectorSettings.READ, ConnectorSettings.WRITE);
        Connected reader = steps.connect(ConnectorSettings.READ);
        save(writer, writer.access()).andExpect(status().isOk());
        save(writer, null).andExpect(status().isForbidden());
        save(reader, reader.access())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("wingtip:flights")));
        // Another pilot's token, though it may write, is not this pilot's.
        save(reader, writer.access()).andExpect(status().isForbidden());
    }

    /** A pilot who consented before V53 renamed the scope: their
     *  connection refreshes to wingtip:read and the old wingtip:write,
     *  which may read but not save. */
    @Test
    void aConnectionConsentedToTheOldScopeIsRefusedASaveOnceRefreshed() throws Exception {
        Connected old = steps.connect(ConnectorSettings.READ, ConnectorSettings.WRITE);
        jdbc.update(
                "UPDATE oauth2_authorization SET authorized_scopes = 'wingtip:read,wingtip:write' WHERE principal_name = ?",
                String.valueOf(old.pilot().getId()));
        String refreshed = refresh(old, old.refresh())
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String access = JsonPath.read(refreshed, "$.access_token");
        assertThat(SignedJWT.parse(access)
                        .getJWTClaimsSet()
                        .getStringClaim("scope")
                        .split(" "))
                .containsExactlyInAnyOrder(ConnectorSettings.READ, "wingtip:write");

        live(old, access).andExpect(status().isNoContent());
        save(old, access).andExpect(status().isForbidden());
    }

    /** Removing Wingtip in Claude revokes its refresh token: every connector
     *  client is public, so it names itself by its id alone, and may end
     *  only its own connection. */
    @Test
    void aPublicClientRevokesItsOwnConnectionAndNoOneElses() throws Exception {
        Connected mine = steps.connect(ConnectorSettings.READ, ConnectorSettings.WRITE);
        Connected other = steps.connect(ConnectorSettings.READ);
        mvc.perform(post("/oauth2/revoke")
                        .param("token", mine.refresh())
                        .param("token_type_hint", "refresh_token")
                        .param("client_id", other.clientId()))
                .andExpect(status().is4xxClientError());
        live(mine, mine.access()).andExpect(status().isNoContent());

        mvc.perform(post("/oauth2/revoke")
                        .param("token", mine.refresh())
                        .param("token_type_hint", "refresh_token")
                        .param("client_id", mine.clientId()))
                .andExpect(status().isOk());
        refresh(mine, mine.refresh()).andExpect(status().isBadRequest());
        live(mine, mine.access()).andExpect(status().isNotFound());
        live(other, other.access()).andExpect(status().isNoContent());
    }

    /** A pilot who left the consent page leaves a row with no expiry to
     *  read; it goes a day after it was begun, its client with it once
     *  that is unused too. */
    @Test
    void anAuthorizationNeverFinishedIsLetGoADayOn() throws Exception {
        String clientId = steps.register("Claude", ConnectorFlowSteps.CLAUDE);
        Cookie session = steps.signedIn();
        mvc.perform(get(URI.create(ConnectorFlowSteps.authorizeUrl(
                                clientId,
                                ConnectorFlowSteps.CLAUDE,
                                ConnectorFlowSteps.challenge("p".repeat(50)),
                                ConnectorFlowSteps.RESOURCE)))
                        .cookie(session))
                .andExpect(status().isFound());
        String rows = "SELECT count(*) FROM oauth2_authorization a JOIN oauth2_registered_client c"
                + " ON c.id = a.registered_client_id WHERE c.client_id = ?";
        assertThat(jdbc.queryForObject(rows, Integer.class, clientId)).isEqualTo(1);

        housekeeping.letGo(Instant.now());
        assertThat(jdbc.queryForObject(rows, Integer.class, clientId)).isEqualTo(1);

        jdbc.update(
                "UPDATE oauth2_authorization a SET created_at = ? FROM oauth2_registered_client c"
                        + " WHERE c.id = a.registered_client_id AND c.client_id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(2))),
                clientId);
        housekeeping.letGo(Instant.now());
        assertThat(jdbc.queryForObject(rows, Integer.class, clientId)).isZero();
    }

    /** Deleting an account ends its connections (AccountService): its
     *  tokens and consents go, another pilot's stay. */
    @Test
    void aPilotsConnectionsAreForgottenAndNoOneElses() {
        String[] ids = {UUID.randomUUID().toString(), UUID.randomUUID().toString()};
        for (String pilot : List.of("41", "42")) {
            jdbc.update(
                    "INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type)"
                            + " VALUES (?, 'claude', ?, 'authorization_code')",
                    ids[pilot.equals("41") ? 0 : 1],
                    pilot);
            jdbc.update(
                    "INSERT INTO oauth2_authorization_consent (registered_client_id, principal_name, authorities)"
                            + " VALUES ('claude', ?, 'SCOPE_wingtip:read')",
                    pilot);
        }
        grants.forget(41L);
        String in = "SELECT principal_name FROM %s WHERE principal_name IN ('41', '42')";
        assertThat(jdbc.queryForList(in.formatted("oauth2_authorization"), String.class))
                .containsExactly("42");
        assertThat(jdbc.queryForList(in.formatted("oauth2_authorization_consent"), String.class))
                .containsExactly("42");
    }
}
