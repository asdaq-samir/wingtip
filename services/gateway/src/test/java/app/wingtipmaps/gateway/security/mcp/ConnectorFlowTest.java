package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import app.wingtipmaps.gateway.security.SignInLanding;
import app.wingtipmaps.gateway.service.PilotService;
import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.savedrequest.DefaultSavedRequest;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Connecting an AI app, end to end, as Claude does it (the MCP spec's
 * authorization flow): read the metadata, register, send the pilot to
 * sign in and consent, exchange the code with its PKCE verifier and the
 * resource, and refresh. Against a real Postgres: the clients,
 * authorizations and consents are Spring's JDBC stores, on V40's tables.
 */
@SpringBootTest(
        properties = {"app.public-base-url=http://localhost", "app.mcp.enabled=true", "app.mcp.internal-token=t"})
@AutoConfigureMockMvc
@Testcontainers
class ConnectorFlowTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    static final String CLAUDE = "https://claude.ai/api/mcp/auth_callback";
    static final String RESOURCE = "http://localhost/mcp";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private PilotService pilots;

    @Autowired
    private FindByIndexNameSessionRepository<? extends Session> sessions;

    @Test
    void theMetadataSaysWhatAClientNeeds() throws Exception {
        mvc.perform(get("/.well-known/oauth-authorization-server"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issuer").value("http://localhost"))
                .andExpect(jsonPath("$.registration_endpoint").value("http://localhost/oauth2/register"))
                .andExpect(jsonPath("$.authorization_endpoint").value("http://localhost/oauth2/authorize"))
                .andExpect(jsonPath("$.token_endpoint").value("http://localhost/oauth2/token"))
                .andExpect(jsonPath("$.jwks_uri").value("http://localhost/oauth2/jwks"))
                .andExpect(jsonPath("$.code_challenge_methods_supported[0]").value("S256"))
                .andExpect(jsonPath("$.token_endpoint_auth_methods_supported.length()")
                        .value(1))
                .andExpect(
                        jsonPath("$.token_endpoint_auth_methods_supported[0]").value("none"))
                .andExpect(jsonPath("$.scopes_supported.length()").value(2))
                .andExpect(jsonPath("$.grant_types_supported.length()").value(2));
    }

    @Test
    void aCallbackOffTheListIsRefused() throws Exception {
        mvc.perform(post("/oauth2/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registration("Stranger", "https://evil.example/callback")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_redirect_uri"));
    }

    @Test
    void aPilotConnectsClaude() throws Exception {
        String clientId = register("Claude", CLAUDE);
        String verifier = UUID.randomUUID() + "-" + UUID.randomUUID();
        String authorize = authorizeUrl(clientId, CLAUDE, challenge(verifier), RESOURCE);

        // Not signed in: kept, and sent to sign in.
        MvcResult kept = mvc.perform(get(URI.create(authorize)))
                .andExpect(status().isFound())
                .andExpect(result ->
                        assertThat(result.getResponse().getRedirectedUrl()).endsWith("/connect"))
                .andReturn();
        Cookie session = kept.getResponse().getCookie("SESSION");
        assertThat(session).isNotNull();
        String page = mvc.perform(get("/connect").cookie(session))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(page).contains("Sign in to connect Claude").contains("name=\"_csrf\"");

        // Signed in: the waiting request is carried on, once.
        Pilot pilot = signIn(session, UUID.randomUUID() + "@example.com");
        page = mvc.perform(get("/connect/continue").cookie(session))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(page).contains("/oauth2/authorize?").contains("Continue");
        assertThat(mvc.perform(get("/connect/continue").cookie(session))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .contains("Nothing to connect");

        // The pilot's consent, which names where the answer goes.
        String consent = mvc.perform(get(URI.create(authorize)).cookie(session))
                .andExpect(status().isFound())
                .andReturn()
                .getResponse()
                .getRedirectedUrl();
        assertThat(consent).contains("/oauth2/consent");
        var asked = UriComponentsBuilder.fromUriString(consent).build().getQueryParams();
        String state = URLDecoder.decode(asked.getFirst("state"), StandardCharsets.UTF_8);
        page = mvc.perform(get(URI.create(consent)).cookie(session))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(page).contains("claude.ai").contains("Save flights to your Wingtip account");

        String callback = mvc.perform(post("/oauth2/authorize")
                        .cookie(session)
                        .param("client_id", clientId)
                        .param("state", state)
                        .param("scope", ConnectorSettings.READ)
                        .param("scope", ConnectorSettings.WRITE))
                .andExpect(status().isFound())
                .andReturn()
                .getResponse()
                .getRedirectedUrl();
        assertThat(callback).startsWith(CLAUDE + "?code=");
        String code = UriComponentsBuilder.fromUriString(callback)
                .build()
                .getQueryParams()
                .getFirst("code");

        // The code for tokens, with the verifier and the resource.
        MvcResult tokens = mvc.perform(post("/oauth2/token")
                        .param("grant_type", "authorization_code")
                        .param("code", code)
                        .param("redirect_uri", CLAUDE)
                        .param("client_id", clientId)
                        .param("code_verifier", verifier)
                        .param("resource", RESOURCE))
                .andExpect(status().isOk())
                .andReturn();
        String body = tokens.getResponse().getContentAsString();
        SignedJWT jwt = SignedJWT.parse(JsonPath.read(body, "$.access_token"));
        assertThat(jwt.getJWTClaimsSet().getAudience()).containsExactly(RESOURCE);
        assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo(String.valueOf(pilot.getId()));
        assertThat(jwt.getJWTClaimsSet().getIssuer()).isEqualTo("http://localhost");
        assertThat(jwt.getJWTClaimsSet().getStringClaim("client_id")).isEqualTo(clientId);
        assertThat(jwt.getJWTClaimsSet().getStringClaim("scope"))
                .isEqualTo(ConnectorSettings.READ + " " + ConnectorSettings.WRITE);
        assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("RS256");
        String jwks = mvc.perform(get("/oauth2/jwks")).andReturn().getResponse().getContentAsString();
        RSAKey key = (RSAKey) JWKSet.parse(jwks).getKeyByKeyId(jwt.getHeader().getKeyID());
        assertThat(jwt.verify(new RSASSAVerifier(key))).isTrue();

        // A refresh, from a public client, spends its refresh token.
        String refresh = JsonPath.read(body, "$.refresh_token");
        String refreshed = mvc.perform(post("/oauth2/token")
                        .param("grant_type", "refresh_token")
                        .param("refresh_token", refresh)
                        .param("client_id", clientId))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat((String) JsonPath.read(refreshed, "$.refresh_token")).isNotEqualTo(refresh);
        SignedJWT again = SignedJWT.parse(JsonPath.read(refreshed, "$.access_token"));
        assertThat(again.getJWTClaimsSet().getAudience()).containsExactly(RESOURCE);
        assertThat(again.getJWTClaimsSet().getSubject()).isEqualTo(String.valueOf(pilot.getId()));
        assertThat(again.getJWTClaimsSet().getStringClaim("scope"))
                .isEqualTo(ConnectorSettings.READ + " " + ConnectorSettings.WRITE);
        mvc.perform(post("/oauth2/token")
                        .param("grant_type", "refresh_token")
                        .param("refresh_token", refresh)
                        .param("client_id", clientId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_grant"));
        // That replay revoked the whole connection (L3): the newer refresh
        // token, the client's or a thief's, is no good either.
        mvc.perform(post("/oauth2/token")
                        .param("grant_type", "refresh_token")
                        .param("refresh_token", (String) JsonPath.read(refreshed, "$.refresh_token"))
                        .param("client_id", clientId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_grant"));
    }

    @Test
    void aTokenForAnotherServerIsRefused() throws Exception {
        String clientId = register("Claude", CLAUDE);
        Cookie session = signedIn();
        String answer = mvc.perform(get(URI.create(
                                authorizeUrl(clientId, CLAUDE, challenge("v".repeat(50)), "https://other.example/mcp")))
                        .cookie(session))
                .andExpect(status().isFound())
                .andReturn()
                .getResponse()
                .getRedirectedUrl();
        assertThat(answer).startsWith(CLAUDE).contains("error=invalid_target");
    }

    /** The page's emailed-link form, which runs no script, is answered
     *  with the page again; and a sign-in while a connection waits lands
     *  where it is carried on, not in the planner. */
    @Test
    void signingInFromThePageComesBackToIt() throws Exception {
        mvc.perform(post("/api/auth/magic-link")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("email", "pilot@example.com"))
                .andExpect(status().isSeeOther())
                .andExpect(header().string("Location", "/connect?sent=1"));
        MockHttpServletRequest request = new MockHttpServletRequest();
        Pilot pilot = pilots.fromVerifiedEmail(UUID.randomUUID() + "@example.com");
        assertThat(SignInLanding.after(pilot, request)).isEqualTo("/app/plan");
        request.getSession(true).setAttribute(PendingConnection.ATTRIBUTE, savedAuthorize());
        assertThat(SignInLanding.after(pilot, request)).isEqualTo(SignInLanding.CONTINUE_CONNECTING);
    }

    private static DefaultSavedRequest savedAuthorize() {
        MockHttpServletRequest asked = new MockHttpServletRequest("GET", "/oauth2/authorize");
        asked.setQueryString("client_id=abc");
        asked.setParameter("client_id", "abc");
        return new DefaultSavedRequest(asked);
    }

    /** Claude Code's callback is http://localhost/callback on whatever
     *  port it has that day. */
    @Test
    void localhostIsMatchedOnAnyPort() throws Exception {
        String clientId = register("Claude Code", "http://localhost/callback");
        Cookie session = signedIn();
        String answer = mvc.perform(get(URI.create(authorizeUrl(
                                clientId, "http://localhost:53682/callback", challenge("w".repeat(50)), RESOURCE)))
                        .cookie(session))
                .andExpect(status().isFound())
                .andReturn()
                .getResponse()
                .getRedirectedUrl();
        assertThat(answer).contains("/oauth2/consent");
        mvc.perform(get(URI.create(authorizeUrl(
                                clientId, "http://localhost:53682/other", challenge("w".repeat(50)), RESOURCE)))
                        .cookie(session))
                .andExpect(status().isBadRequest());
    }

    /** A session of its own, signed in by an emailed link. */
    private Cookie signedIn() {
        String id = put(sessions, null, null);
        Cookie cookie = new Cookie("SESSION", Base64.getEncoder().encodeToString(id.getBytes(StandardCharsets.UTF_8)));
        signIn(cookie, UUID.randomUUID() + "@example.com");
        return cookie;
    }

    /** Signs the session in as the emailed link does: its security
     *  context, in the session Postgres keeps. */
    private Pilot signIn(Cookie session, String email) {
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

    private String register(String name, String redirect) throws Exception {
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

    private static String registration(String name, String redirect) {
        return """
                {"client_name": "%s", "redirect_uris": ["%s"],
                 "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
                 "token_endpoint_auth_method": "none"}""".formatted(name, redirect);
    }

    private static String authorizeUrl(String clientId, String redirect, String challenge, String resource) {
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

    private static String challenge(String verifier) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }
}
