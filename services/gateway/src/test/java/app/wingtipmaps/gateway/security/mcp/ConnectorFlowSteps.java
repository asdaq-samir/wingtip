package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import app.wingtipmaps.gateway.service.PilotService;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * The steps of connecting an AI app as Claude takes them (the MCP spec's
 * authorization flow), for the tests that connect one: register, sign the
 * pilot in, consent, and trade the code for tokens.
 */
final class ConnectorFlowSteps {

    static final String CLAUDE = "https://claude.ai/api/mcp/auth_callback";
    static final String RESOURCE = "http://localhost/mcp";

    private final MockMvc mvc;
    private final PilotService pilots;
    private final FindByIndexNameSessionRepository<? extends Session> sessions;

    ConnectorFlowSteps(MockMvc mvc, PilotService pilots, FindByIndexNameSessionRepository<? extends Session> sessions) {
        this.mvc = mvc;
        this.pilots = pilots;
        this.sessions = sessions;
    }

    /** A pilot connected through a new client, who ticked `scopes` on the
     *  consent page: who they are, the client, and the token answer. */
    record Connected(Pilot pilot, String clientId, String tokens) {
        String access() {
            return JsonPath.read(tokens, "$.access_token");
        }

        String refresh() {
            return JsonPath.read(tokens, "$.refresh_token");
        }
    }

    Connected connect(String... scopes) throws Exception {
        String clientId = register("Claude", CLAUDE);
        String verifier = UUID.randomUUID() + "-" + UUID.randomUUID();
        Cookie session = session();
        Pilot pilot = signIn(session, UUID.randomUUID() + "@example.com");
        String consent = mvc.perform(get(URI.create(authorizeUrl(clientId, CLAUDE, challenge(verifier), RESOURCE)))
                        .cookie(session))
                .andExpect(status().isFound())
                .andReturn()
                .getResponse()
                .getRedirectedUrl();
        String state = URLDecoder.decode(
                UriComponentsBuilder.fromUriString(consent)
                        .build()
                        .getQueryParams()
                        .getFirst("state"),
                StandardCharsets.UTF_8);
        MockHttpServletRequestBuilder consented = post("/oauth2/authorize")
                .cookie(session)
                .param("client_id", clientId)
                .param("state", state);
        for (String scope : scopes) {
            consented.param("scope", scope);
        }
        String callback = mvc.perform(consented)
                .andExpect(status().isFound())
                .andReturn()
                .getResponse()
                .getRedirectedUrl();
        String code = UriComponentsBuilder.fromUriString(callback)
                .build()
                .getQueryParams()
                .getFirst("code");
        String tokens = mvc.perform(post("/oauth2/token")
                        .param("grant_type", "authorization_code")
                        .param("code", code)
                        .param("redirect_uri", CLAUDE)
                        .param("client_id", clientId)
                        .param("code_verifier", verifier)
                        .param("resource", RESOURCE))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return new Connected(pilot, clientId, tokens);
    }

    /** A session of its own, signed in by an emailed link. */
    Cookie signedIn() {
        Cookie cookie = session();
        signIn(cookie, UUID.randomUUID() + "@example.com");
        return cookie;
    }

    private Cookie session() {
        String id = put(sessions, null, null);
        return new Cookie("SESSION", Base64.getEncoder().encodeToString(id.getBytes(StandardCharsets.UTF_8)));
    }

    /** Signs the session in as the emailed link does: its security
     *  context, in the session Postgres keeps. */
    Pilot signIn(Cookie session, String email) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new MagicLinkAuthenticationToken(email));
        String id = new String(Base64.getDecoder().decode(session.getValue()), StandardCharsets.UTF_8);
        put(sessions, id, context);
        return pilots.fromVerifiedEmail(email);
    }

    private static <S extends Session> String put(
            FindByIndexNameSessionRepository<S> repository, String id, SecurityContext context) {
        S session = id == null ? repository.createSession() : repository.findById(id);
        if (context != null) {
            session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        }
        repository.save(session);
        return session.getId();
    }

    String register(String name, String redirect) throws Exception {
        String answer = mvc.perform(post("/oauth2/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registration(name, redirect)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token_endpoint_auth_method").value("none"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(answer).doesNotContain("\"client_secret\"");
        return JsonPath.read(answer, "$.client_id");
    }

    static String registration(String name, String redirect) {
        return """
                {"client_name": "%s", "redirect_uris": ["%s"],
                 "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
                 "token_endpoint_auth_method": "none"}""".formatted(name, redirect);
    }

    static String authorizeUrl(String clientId, String redirect, String challenge, String resource) {
        return UriComponentsBuilder.fromPath("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirect)
                .queryParam("scope", ConnectorSettings.READ + " " + ConnectorSettings.WRITE)
                .queryParam("state", "s-" + UUID.randomUUID())
                .queryParam("code_challenge", challenge)
                .queryParam("code_challenge_method", "S256")
                .queryParam("resource", resource)
                .encode()
                .build()
                .toUriString();
    }

    static String challenge(String verifier) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }
}
