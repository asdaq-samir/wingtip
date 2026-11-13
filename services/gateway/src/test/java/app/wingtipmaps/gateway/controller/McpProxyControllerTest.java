package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.ErrorResponseException;

/** /mcp's body limit, held on the bytes read (the security audit's L6). */
class McpProxyControllerTest {

    /** A chunked request: no Content-Length, as Tomcat answers -1. */
    private static MockHttpServletRequest chunked(int bytes) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/mcp") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }

            @Override
            public int getContentLength() {
                return -1;
            }
        };
        request.setContent(new byte[bytes]);
        return request;
    }

    @Test
    void aChunkedBodyOverTheLimitIsRefusedUnread() throws Exception {
        // No proxy: a request that got as far as the planner would fail here.
        var controller = new McpProxyController(null, "http://planner.test");
        // Refused as a problem (StreamingProxy.problem), which
        // GlobalExceptionHandler answers as a 413.
        assertThatThrownBy(() -> controller.mcp(chunked((int) McpProxyController.BODY_LIMIT + 1)))
                .isInstanceOfSatisfying(
                        ErrorResponseException.class,
                        refused -> assertThat(refused.getStatusCode().value()).isEqualTo(413));
    }
}
