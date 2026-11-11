package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Open registration held back (the security audit's M3): so many an
 * address an hour, names and callbacks no longer than a client's ever are,
 * a body no bigger than its metadata, and clients nobody connected through
 * let go after a day.
 */
@SpringBootTest(
        properties = {
            "app.mcp.enabled=true",
            "app.mcp.internal-token=t",
            "app.mcp.registrations-per-client-per-hour=3",
            "app.mcp.housekeeping-cron=-"
        })
@AutoConfigureMockMvc
@Testcontainers
class ConnectorRegistrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    static final String CLAUDE = "https://claude.ai/api/mcp/auth_callback";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcOperations jdbc;

    @Autowired
    private ConnectorHousekeeping housekeeping;

    private static String registration(String name, String... redirects) {
        String[] callbacks = redirects.length == 0 ? new String[] {CLAUDE} : redirects;
        return "{\"client_name\":\"" + name + "\",\"redirect_uris\":[\"" + String.join("\",\"", callbacks)
                + "\"],\"token_endpoint_auth_method\":\"none\"}";
    }

    private org.springframework.test.web.servlet.ResultActions register(String address, String body) throws Exception {
        return mvc.perform(post("/oauth2/register")
                .with(request -> {
                    request.setRemoteAddr(address);
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void anAddressRegistersSoManyAnHourAndAnotherIsNotHeldBack() throws Exception {
        for (int i = 0; i < 3; i++) {
            register("203.0.113.7", registration("Claude")).andExpect(status().isCreated());
        }
        register("203.0.113.7", registration("Claude"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "3600"));
        register("203.0.113.8", registration("Claude")).andExpect(status().isCreated());
    }

    @Test
    void aLongNameOrTooManyCallbacksAreRefused() throws Exception {
        register("198.51.100.1", registration("x".repeat(ConnectorClients.NAME_LIMIT + 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_client_metadata"));
        register("198.51.100.2", registration("Claude", CLAUDE, CLAUDE, CLAUDE, CLAUDE, CLAUDE))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_redirect_uri"));
        register("198.51.100.3", registration("Claude", "http://localhost/" + "a".repeat(300)))
                .andExpect(status().isBadRequest());
        String huge = "{\"client_name\":\"Claude\",\"redirect_uris\":[\"" + CLAUDE + "\"],\"logo_uri\":\""
                + "a".repeat(RegistrationLimit.BODY_LIMIT) + "\"}";
        register("198.51.100.4", huge).andExpect(status().isContentTooLarge());
    }

    @Test
    void clientsNobodyConnectedThroughAreLetGoAfterADay() throws Exception {
        register("192.0.2.9", registration("Unused")).andExpect(status().isCreated());
        register("192.0.2.9", registration("Used")).andExpect(status().isCreated());
        String used =
                jdbc.queryForObject("SELECT id FROM oauth2_registered_client WHERE client_name = 'Used'", String.class);
        jdbc.update(
                "INSERT INTO oauth2_authorization (id, registered_client_id, principal_name, authorization_grant_type,"
                        + " refresh_token_value, refresh_token_expires_at) VALUES ('live', ?, '7',"
                        + " 'authorization_code', 'r', ?)",
                used,
                Timestamp.from(Instant.now().plus(Duration.ofDays(20))));

        // The same day: nothing goes.
        housekeeping.letGo(Instant.now());
        assertThat(names()).contains("Unused", "Used");
        // Two days on: the unused one goes, the connected one stays.
        housekeeping.letGo(Instant.now().plus(Duration.ofDays(2)));
        assertThat(names()).doesNotContain("Unused").contains("Used");
        // Its connection ended long ago: it goes, and then so does it.
        housekeeping.letGo(Instant.now().plus(Duration.ofDays(40)));
        assertThat(names()).doesNotContain("Used");
    }

    private java.util.List<String> names() {
        return jdbc.queryForList("SELECT client_name FROM oauth2_registered_client", String.class);
    }
}
