package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The connector's other two halves: /mcp passed on to the planner as it
 * came, and the pilot's records read and written by the planner's tools
 * with the token the two share -- refused, as a 404, to anyone without it.
 */
@SpringBootTest(properties = "app.mcp.internal-token=" + ConnectorRecordsTest.TOKEN)
@AutoConfigureMockMvc
@Testcontainers
class ConnectorRecordsTest {

    static final String TOKEN = "planner-and-gateway";

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    /** The planner: its MCP server, and the inspections an airplane's card asks it for. */
    private static HttpServer planner;

    private static final List<String> asked = new CopyOnWriteArrayList<>();

    @Autowired
    private MockMvc mvc;

    @Autowired
    private PilotRepository pilots;

    @Autowired
    private AircraftRepository aircraft;

    @BeforeAll
    static void startPlanner() throws IOException {
        planner = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        planner.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            asked.add(exchange.getRequestMethod() + " " + path + " auth="
                    + exchange.getRequestHeaders().getFirst("Authorization") + " session="
                    + exchange.getRequestHeaders().getFirst("Mcp-Session-Id") + " body="
                    + new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body;
            if (path.equals("/mcp")) {
                exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
                exchange.getResponseHeaders().add("Mcp-Session-Id", "s-1");
                exchange.getResponseHeaders()
                        .add("WWW-Authenticate", "Bearer resource_metadata=\"http://localhost/x\"");
                body = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n\n"
                        .getBytes(StandardCharsets.UTF_8);
            } else if (path.equals("/.well-known/oauth-protected-resource/mcp")) {
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                body = "{\"resource\":\"http://localhost/mcp\"}".getBytes(StandardCharsets.UTF_8);
            } else {
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                body = "{}".getBytes(StandardCharsets.UTF_8);
            }
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        planner.start();
    }

    @AfterAll
    static void stopPlanner() {
        planner.stop(0);
    }

    @DynamicPropertySource
    static void plannerUrl(DynamicPropertyRegistry registry) {
        registry.add(
                "planner-service.base-url",
                () -> "http://127.0.0.1:" + planner.getAddress().getPort());
    }

    @Test
    void mcpIsPassedOnAsItCame() throws Exception {
        MvcResult started = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer abc")
                        .header("Mcp-Session-Id", "s-0")
                        .header("Accept", "application/json, text/event-stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();
        mvc.perform(asyncDispatch(started))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/event-stream"))
                .andExpect(header().string("Mcp-Session-Id", "s-1"))
                .andExpect(header().exists("WWW-Authenticate"))
                .andExpect(result ->
                        assertThat(result.getResponse().getContentAsString()).contains("event: message"));
        assertThat(asked)
                .contains(
                        "POST /mcp auth=Bearer abc session=s-0 body={\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertThat(started.getRequest().getSession(false)).isNull();

        MvcResult metadata =
                mvc.perform(get("/.well-known/oauth-protected-resource/mcp")).andReturn();
        mvc.perform(asyncDispatch(metadata))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resource").value("http://localhost/mcp"));
    }

    @Test
    void theRecordsAnswerOnlyThePlanner() throws Exception {
        Pilot pilot =
                pilots.save(new Pilot(UUID.randomUUID() + "@example.com", "Test Pilot", "sub-" + UUID.randomUUID()));
        aircraft.saveAndFlush(new Aircraft(pilot, "N12345", "C172", 110.0, 8.5, null, null, null, null));
        String id = String.valueOf(pilot.getId());

        mvc.perform(get("/internal/mcp/aircraft").header("X-Pilot-Id", id)).andExpect(status().isNotFound());
        mvc.perform(get("/internal/mcp/aircraft").header("X-Pilot-Id", id).header("X-Internal-Token", "guess"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/internal/mcp/aircraft").header("X-Pilot-Id", "999999").header("X-Internal-Token", TOKEN))
                .andExpect(status().isNotFound());
        mvc.perform(get("/internal/mcp/aircraft").header("X-Pilot-Id", id).header("X-Internal-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tailNumber").value("N12345"))
                .andExpect(jsonPath("$[0].cruiseTasKt").value(110.0));

        mvc.perform(post("/internal/mcp/flights")
                        .header("X-Pilot-Id", id)
                        .header("X-Internal-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureIdent\":\"C81\",\"destinationIdent\":\"not an ident\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/internal/mcp/flights")
                        .header("X-Pilot-Id", id)
                        .header("X-Internal-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"departureIdent\":\"C81\",\"destinationIdent\":\"KDLH\",\"cruiseAltitudeFt\":5500,"
                                + "\"stops\":[\"KDSM\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destinationIdent").value("KDLH"));
        mvc.perform(get("/internal/mcp/flights").header("X-Pilot-Id", id).header("X-Internal-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].stops[0]").value("KDSM"));
    }

    @Autowired
    private JdbcOperations jdbc;

    @Autowired
    private ConnectorGrants grants;

    /** Deleting an account ends its connections (AccountService): its
     *  tokens and consents go, another pilot's stay. */
    @Test
    void aPilotsConnectionsAreForgottenAndNoOneElses() {
        for (String pilot : List.of("41", "42")) {
            jdbc.update(
                    "INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type)"
                            + " VALUES (?, 'claude', ?, 'authorization_code')",
                    "a" + pilot,
                    pilot);
            jdbc.update(
                    "INSERT INTO oauth2_authorization_consent (registered_client_id, principal_name, authorities)"
                            + " VALUES ('claude', ?, 'SCOPE_wingtip:read')",
                    pilot);
        }
        grants.forget(41L);
        assertThat(jdbc.queryForList("SELECT principal_name FROM oauth2_authorization", String.class))
                .containsExactly("42");
        assertThat(jdbc.queryForList("SELECT principal_name FROM oauth2_authorization_consent", String.class))
                .containsExactly("42");
    }

    /** A connection whose every token ran out over a day ago goes in the
     *  nightly purge; a live one, and one still being authorized, stay. */
    @Test
    void expiredConnectionsArePurgedAndLiveOnesKept() {
        jdbc.update("DELETE FROM oauth2_authorization");
        jdbc.update(
                "INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type,"
                        + " access_token_issued_at, access_token_expires_at, refresh_token_expires_at) VALUES"
                        + " ('gone', 'claude', '7', 'authorization_code', now() - interval '40 days',"
                        + " now() - interval '40 days', now() - interval '10 days'),"
                        + " ('live', 'claude', '8', 'authorization_code', now() - interval '20 days',"
                        + " now() - interval '20 days', now() + interval '10 days')");
        jdbc.update("INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type)"
                + " VALUES ('pending', 'claude', '9', 'authorization_code')");
        assertThat(grants.purgeExpired()).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT id FROM oauth2_authorization ORDER BY id", String.class))
                .containsExactly("live", "pending");
        jdbc.update("DELETE FROM oauth2_authorization");
    }
}
