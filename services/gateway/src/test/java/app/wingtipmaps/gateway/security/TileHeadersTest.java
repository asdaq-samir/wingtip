package app.wingtipmaps.gateway.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;

import app.wingtipmaps.gateway.controller.PilotController;
import app.wingtipmaps.gateway.service.AccountService;
import app.wingtipmaps.gateway.service.CheckpointNotesClient;
import app.wingtipmaps.gateway.service.PilotService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A map tile goes out without the page's headers (TileSecurityConfig): no
 * XSRF-TOKEN cookie, no Content-Security-Policy, nosniff kept; a page's
 * answer keeps them all, and a tile is still asked for by anyone. With a
 * mail host, so sign-in is possible and the app's chain is the strict one.
 */
@WebMvcTest(PilotController.class)
@Import({TileSecurityConfig.class, SecurityConfig.class})
@TestPropertySource(properties = "spring.mail.host=smtp.example.com")
class TileHeadersTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PilotService pilotService;

    @MockitoBean
    private AccountService accountService;

    @MockitoBean
    private CheckpointNotesClient checkpointNotes;

    private MockHttpServletResponse tile(String path) throws Exception {
        return mockMvc.perform(get(path)).andReturn().getResponse();
    }

    @Test
    void theTilesCarryNoCookieAndNoPolicy() throws Exception {
        for (String path : new String[] {
            "/api/planner/chart-tile/sectional/9/131/190.png",
            "/api/planner/terrain-tile/9/131/190.png",
            "/api/planner/overlay-tiles/2026-10-29-v9-0badf00d.pmtiles"
        }) {
            MockHttpServletResponse response = tile(path);
            // Refused would be 401 or 403; no proxy is in this slice, so 404.
            assertThat(response.getStatus()).as(path).isNotIn(401, 403);
            assertThat(response.getHeader("Content-Security-Policy")).as(path).isNull();
            assertThat(response.getHeader("X-Frame-Options")).as(path).isNull();
            assertThat(response.getHeaders("Set-Cookie")).as(path).noneMatch(c -> c.startsWith("XSRF-TOKEN"));
            assertThat(response.getCookie("XSRF-TOKEN")).as(path).isNull();
            assertThat(response.getHeader("X-Content-Type-Options")).as(path).isEqualTo("nosniff");
        }
    }

    @Test
    void aPageKeepsItsHeaders() throws Exception {
        MockHttpServletResponse page =
                mockMvc.perform(get("/api/me")).andReturn().getResponse();
        assertThat(page.getHeader("Content-Security-Policy")).isNotBlank();
        assertThat(page.getHeader("X-Frame-Options")).isEqualTo("DENY");
    }

    /** Only a public tile GET takes the short chain: a HEAD, which no
     *  tile route admits, is still the app's to refuse. */
    @Test
    void aHeadOfATileIsStillTheAppsChains() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(head("/api/planner/chart-tile/sectional/9/131/190.png"))
                .andReturn()
                .getResponse();
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getHeader("Content-Security-Policy")).isNotBlank();
    }
}
