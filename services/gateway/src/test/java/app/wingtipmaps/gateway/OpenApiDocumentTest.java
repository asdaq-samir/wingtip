package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * The committed services/gateway/openapi.json is what apps/web/ generates its
 * types for this app's endpoints from ({@code npm run types}), so it has
 * to be the document this code actually serves -- the same guarantee
 * planner's services/planner/tests/test_openapi.py gives for the planner's.
 *
 * <p>After changing a controller or a DTO, regenerate it by running the
 * suite with {@code WRITE_OPENAPI=1} in the environment, and commit the
 * file. Written with sorted keys, so a regeneration diffs as the change
 * it is and nothing else.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class OpenApiDocumentTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    /** Maven runs the tests from services/gateway/. */
    private static final Path DOCUMENT = Path.of("openapi.json");

    @Autowired
    private MockMvc mockMvc;

    @Test
    void theCommittedDocumentIsTheOneThisAppServes() throws Exception {
        String served = sorted(mockMvc.perform(get("/v3/api-docs"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8));
        if ("1".equals(System.getenv("WRITE_OPENAPI"))) {
            Files.writeString(DOCUMENT, served);
        }
        assertThat(Files.readString(DOCUMENT))
                .as(
                        "a controller or DTO changed: run the suite with WRITE_OPENAPI=1 and commit services/gateway/openapi.json")
                .isEqualTo(served);
    }

    private static String sorted(String json) throws Exception {
        ObjectMapper mapper = JsonMapper.builder()
                .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                .build();
        Map<?, ?> document = mapper.readValue(json, Map.class);
        return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(document) + "\n";
    }
}
