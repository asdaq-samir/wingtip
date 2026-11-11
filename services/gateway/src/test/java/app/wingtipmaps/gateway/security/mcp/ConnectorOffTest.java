package app.wingtipmaps.gateway.security.mcp;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The connector off, as it is by default and in production until it
 * launches (MCP_ENABLED unset): nobody can register a client, ask for a
 * token, read the metadata or reach /mcp: every one a 404.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ConnectorOffTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    @Autowired
    private MockMvc mvc;

    @Test
    void everyConnectorAddressIsA404() throws Exception {
        mvc.perform(
                        post("/oauth2/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"client_name\":\"x\",\"redirect_uris\":[\"https://claude.ai/api/mcp/auth_callback\"]}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/oauth2/token").param("grant_type", "refresh_token")).andExpect(status().isNotFound());
        mvc.perform(get("/.well-known/oauth-authorization-server")).andExpect(status().isNotFound());
        mvc.perform(get("/oauth2/jwks")).andExpect(status().isNotFound());
        mvc.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/connect")).andExpect(status().isNotFound());
    }
}
