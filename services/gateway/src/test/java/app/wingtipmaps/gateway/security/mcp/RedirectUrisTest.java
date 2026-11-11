package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** The callbacks a self-registering client may name: application.yml's list, read as RedirectUris reads it. */
class RedirectUrisTest {

    private final RedirectUris allowed = new RedirectUris(List.of(
            "https://claude.ai/api/mcp/auth_callback",
            "https://chatgpt.com/connector_platform_oauth_redirect",
            "https://chatgpt.com/connector/oauth/*",
            "http://localhost",
            "http://127.0.0.1"));

    @Test
    void claudeChatGptAndALoopbackOnAnyPortAreAllowed() {
        assertThat(allowed.allows("https://claude.ai/api/mcp/auth_callback")).isTrue();
        assertThat(allowed.allows("https://chatgpt.com/connector_platform_oauth_redirect"))
                .isTrue();
        assertThat(allowed.allows("https://chatgpt.com/connector/oauth/abc123")).isTrue();
        assertThat(allowed.allows("http://localhost:6274/oauth/callback")).isTrue();
        assertThat(allowed.allows("http://127.0.0.1:53682/callback")).isTrue();
    }

    @Test
    void anythingElseIsRefused() {
        assertThat(allowed.allows("https://claude.ai/api/mcp/auth_callback/../evil"))
                .isFalse();
        assertThat(allowed.allows("https://evil.example/callback")).isFalse();
        assertThat(allowed.allows("http://localhost.evil.example/callback")).isFalse();
        assertThat(allowed.allows("https://localhost/callback")).isFalse();
        assertThat(allowed.allows("https://claude.ai/api/mcp/auth_callback#x")).isFalse();
        assertThat(allowed.allows("not a uri")).isFalse();
    }

    @Test
    void aLoopbackCallbackMatchesItsPathOnAnyPort() {
        assertThat(RedirectUris.sameLoopbackIgnoringPort("http://localhost/callback", "http://localhost:1234/callback"))
                .isTrue();
        assertThat(RedirectUris.sameLoopbackIgnoringPort("http://localhost/callback", "http://localhost:1234/other"))
                .isFalse();
        assertThat(RedirectUris.sameLoopbackIgnoringPort("https://claude.ai/cb", "https://claude.ai:444/cb"))
                .isFalse();
    }
}
