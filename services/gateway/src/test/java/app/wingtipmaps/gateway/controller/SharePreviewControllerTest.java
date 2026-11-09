package app.wingtipmaps.gateway.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.config.WebMvcConfig;
import app.wingtipmaps.gateway.security.SecurityConfig;
import app.wingtipmaps.gateway.service.FlightShareService;
import app.wingtipmaps.gateway.service.PilotService;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * A shared flight's link, as a preview's fetcher reads it: the app's page
 * with the route in its Open Graph tags, escaped, and the app's own
 * preview for anything else.
 */
@WebMvcTest(value = SharePreviewController.class, properties = "app.static-location=classpath:/share-test/")
@Import({SecurityConfig.class, WebMvcConfig.class})
class SharePreviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FlightShareService shares;

    @MockitoBean
    private PilotService pilotService;

    @Test
    void aPlainLinkIsPreviewedByItsRouteAndAltitude() throws Exception {
        mockMvc.perform(get("/app/plan?open=shared&dep=kmsn&dest=KOSH&altitude_ft=3500&type=C172&rules=vfr"))
                .andExpect(status().isOk())
                .andExpect(content()
                        .string(containsString("<meta property=\"og:title\" content=\"KMSN → KOSH · 3,500 ft\" />")))
                .andExpect(content().string(containsString("<title>KMSN → KOSH · 3,500 ft</title>")))
                .andExpect(content().string(containsString("C172 · VFR · Open the route")))
                .andExpect(content().string(containsString("<div id=\"root\">")));
    }

    @Test
    void itsStopsAreOnTheWay() throws Exception {
        mockMvc.perform(get("/app/plan?open=shared&dep=KMSN&dest=KOSH&stops=KJVL,KUES"))
                .andExpect(content().string(containsString("content=\"KMSN → KJVL → KUES → KOSH\"")));
    }

    @Test
    void nothingButIdentsIsWritten() throws Exception {
        mockMvc.perform(get("/app/plan")
                        .param("open", "shared")
                        .param("dep", "\"><script>")
                        .param("dest", "KOSH"))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("<script>"))))
                .andExpect(content().string(containsString("content=\"Wingtip Maps\"")));
    }

    @Test
    void aSavedFlightsLinkHasItsRouteDrawn() throws Exception {
        given(shares.shared("tok")).willReturn(Optional.of(FlightShareControllerTest.sampleShared()));

        mockMvc.perform(get("/app/plan?open=shared&share=tok"))
                .andExpect(content().string(containsString("content=\"KMSN → KOSH · 3,500 ft\"")))
                .andExpect(content().string(containsString("/api/shared-flights/tok/image.png")))
                .andExpect(content().string(containsString("summary_large_image")));
    }

    @Test
    void aStoppedShareGetsTheAppsOwnPreview() throws Exception {
        given(shares.shared(any())).willReturn(Optional.empty());

        mockMvc.perform(get("/app/plan?open=shared&share=gone"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("<meta property=\"og:title\" content=\"Wingtip Maps\" />")));
    }

    @Test
    void anyOtherPlanAddressIsTheStaticIndex() throws Exception {
        mockMvc.perform(get("/app/plan?dep=KMSN&dest=KOSH"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("<meta property=\"og:title\" content=\"Wingtip Maps\" />")));
    }
}
