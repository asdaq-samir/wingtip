package app.wingtipmaps.gateway.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import app.wingtipmaps.gateway.controller.PilotController;
import app.wingtipmaps.gateway.controller.RoutesBefore;
import app.wingtipmaps.gateway.controller.SignInCapabilitiesController;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.PilotRole;
import app.wingtipmaps.gateway.service.AccountService;
import app.wingtipmaps.gateway.service.PilotService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/**
 * SecurityConfig's rules for the planner's routes, now built from its
 * OpenAPI document, refuse and admit every route the old hand-written
 * matchers sent to it: driven route by route, signed out, signed
 * in as a plain pilot and without a CSRF token, as the old rules were when
 * planner-routes-before.tsv was recorded (RoutesBefore).
 */
@WebMvcTest({PilotController.class, SignInCapabilitiesController.class})
@Import(SecurityConfig.class)
@TestPropertySource(properties = "spring.mail.host=smtp.example.com")
class UpstreamSecurityRulesTest {

    /**
     * A HEAD is answered by the GET's handler and reaches the planner as
     * that GET, so a plain pilot's HEAD ran the developer's chart reads
     * (a corridor's chart-vision job, the classifier, the model
     * comparison): it is now refused as the GET is. The one change.
     */
    static final Set<String> HEAD_NOW_THE_DEVELOPERS =
            Set.of("/api/detect/stream", "/api/classify", "/api/model-comparison");

    /** The old routes wider than the planner answered (UpstreamRoutesTest's
     *  NARROWED), probed at an address it does answer: the rest of what
     *  they matched is no route now, and needs a session as any unknown
     *  address does. */
    static final Map<String, String> ANSWERED = Map.of(
            "/api/overlay-tiles/{file}", "/api/overlay-tiles/X.pmtiles",
            "/api/cycle-pack/{cycle}/{file}", "/api/cycle-pack/X/X.pack");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PilotService pilotService;

    @MockitoBean
    private AccountService accountService;

    private int status(String method, String path, boolean token, boolean signedIn) throws Exception {
        var builder = request(HttpMethod.valueOf(method), path);
        if (token) {
            builder.with(csrf());
        }
        if (signedIn) {
            builder.with(oidcLogin());
        }
        return mockMvc.perform(builder).andReturn().getResponse().getStatus();
    }

    private String access(String method, String path) throws Exception {
        if (status(method, path, true, false) != 401) {
            return "public";
        }
        return status(method, path, true, true) == 403 ? "developer" : "signed-in";
    }

    @Test
    void everyRouteIsRefusedAndAdmittedAsTheHandWrittenRulesDid() throws Exception {
        Pilot pilot = new Pilot("pilot@example.com", "A. Pilot", "sub-1");
        ReflectionTestUtils.setField(pilot, "role", PilotRole.PILOT);
        given(pilotService.current(any())).willReturn(Optional.of(pilot));
        List<String> differences = new ArrayList<>();
        for (RoutesBefore route : RoutesBefore.all()) {
            if (route.takenOut()) {
                continue;
            }
            String path = "/api/planner"
                    + ANSWERED.getOrDefault(route.pattern(), route.sample()).substring("/api".length());
            String name = route.method() + " " + route.pattern();
            String access = access(route.method(), path);
            if (!access.equals(route.access())) {
                differences.add(name + ": access was " + route.access() + ", is " + access);
            }
            if (!"GET".equals(route.method())) {
                String csrfRule = status(route.method(), path, false, false) == 403 ? "checked" : "exempt";
                if (!csrfRule.equals(route.csrf())) {
                    differences.add(name + ": csrf was " + route.csrf() + ", is " + csrfRule);
                }
            } else {
                String head = access("HEAD", path);
                String expected = HEAD_NOW_THE_DEVELOPERS.contains(route.pattern()) ? "developer" : route.headAccess();
                if (!head.equals(expected)) {
                    differences.add(name + ": HEAD was " + route.headAccess() + ", is " + head);
                }
            }
        }
        assertThat(differences).isEmpty();
        // And each of the three was signed-in before, so the list above
        // names a real change and nothing else.
        assertThat(RoutesBefore.all())
                .filteredOn(route -> HEAD_NOW_THE_DEVELOPERS.contains(route.pattern()))
                .hasSize(3)
                .allSatisfy(route -> assertThat(route.headAccess()).isEqualTo("signed-in"));
    }
}
