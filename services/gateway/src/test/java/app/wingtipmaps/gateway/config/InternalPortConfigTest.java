package app.wingtipmaps.gateway.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/** /internal/** on the internal port and nothing else there. */
class InternalPortConfigTest {

    private static MockHttpServletRequest at(int port, String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
        request.setLocalPort(port);
        return request;
    }

    @Test
    void theInternalRoutesAnswerOnlyOnTheirPort() {
        var filter = new InternalPortConfig.OnlyOnItsPort(8081);
        assertThat(filter.allows(at(8081, "/internal/mcp/aircraft"))).isTrue();
        assertThat(filter.allows(at(8080, "/internal/mcp/aircraft"))).isFalse();
        assertThat(filter.allows(at(8443, "/internal/mcp/aircraft"))).isFalse();
        assertThat(filter.allows(at(8080, "/%69nternal/mcp/aircraft"))).isFalse();
        assertThat(filter.allows(at(8080, "/INTERNAL/mcp/aircraft"))).isFalse();
        assertThat(filter.allows(at(8080, "/api/me"))).isTrue();
        assertThat(filter.allows(at(8081, "/api/me"))).isFalse();
    }

    @Test
    void withNoInternalPortTheyAnswerNobody() {
        var filter = new InternalPortConfig.OnlyOnItsPort(0);
        assertThat(filter.allows(at(8080, "/internal/mcp/aircraft"))).isFalse();
        assertThat(filter.allows(at(0, "/internal/mcp/aircraft"))).isFalse();
        assertThat(filter.allows(at(8080, "/api/me"))).isTrue();
    }
}
