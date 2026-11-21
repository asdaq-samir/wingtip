package app.wingtipmaps.gateway.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.ServletRequest;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** No request body past the limit is read, declared or chunked. */
class RequestBodyLimitTest {

    /** A body whose length is declared, as MockHttpServletRequest declares its content's. */
    private static MockHttpServletRequest post(int bytes) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/diagnostics");
        request.setContentType("application/json");
        request.setContent(new byte[bytes]);
        return request;
    }

    @Test
    void aBodyDeclaredPastTheLimitIsRefusedBeforeAnythingReadsIt() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();
        new RequestBodyLimit(1024).doFilter(post(1025), response, chain);
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void aBodyWithinTheLimitIsReadWhole() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        new RequestBodyLimit(1024).doFilter(post(1024), new MockHttpServletResponse(), chain);
        ServletRequest passed = chain.getRequest();
        assertThat(passed.getInputStream().readAllBytes()).hasSize(1024);
    }

    @Test
    void aBodyOfNoDeclaredLengthStopsAtTheLimit() throws Exception {
        // As a chunked body arrives: no length said.
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/diagnostics") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }
        };
        request.setContent(new byte[4096]);
        MockFilterChain chain = new MockFilterChain();
        new RequestBodyLimit(1024).doFilter(request, new MockHttpServletResponse(), chain);
        HttpServletRequest passed = (HttpServletRequest) chain.getRequest();
        assertThatThrownBy(() -> passed.getInputStream().readAllBytes()).isInstanceOf(RequestBodyLimit.TooLarge.class);
    }

    @Test
    void theLimitIsPastWhatTheAppsSend() {
        // A 5,000-entry logbook import is about 6 MB.
        assertThat(RequestBodyLimit.LIMIT).isEqualTo(10L * 1024 * 1024);
    }
}
