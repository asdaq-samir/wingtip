package app.wingtipmaps.gateway.tracing;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import io.micrometer.tracing.propagation.Propagator;
import io.micrometer.tracing.test.simple.SimpleTracer;
import java.net.URI;
import java.net.http.HttpRequest;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** The headers an upstream request carries, and the request id they
 *  carry, as the page sent it or as made here. */
class TraceHeadersTest {

    private static final HttpRequest ASKED = HttpRequest.newBuilder(URI.create("http://planner:8000/api/navlog"))
            .GET()
            .build();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void withNoTraceAndNoRequestIdTheRequestGoesAsBuilt() {
        assertThat(TraceHeaders.NONE.traced(ASKED)).isSameAs(ASKED);
    }

    @Test
    void theRequestIdGoesOnUpstream() {
        MDC.put(RequestIdFilter.MDC_KEY, "r-123");
        HttpRequest sent = TraceHeaders.NONE.traced(ASKED);
        assertThat(sent.headers().firstValue(RequestIdFilter.HEADER)).contains("r-123");
        assertThat(sent.uri()).isEqualTo(ASKED.uri());
    }

    @Test
    void theCurrentTraceGoesOnAsTraceparent() {
        SimpleTracer tracer = new SimpleTracer();
        Propagator w3c = new Propagator() {
            @Override
            public List<String> fields() {
                return List.of("traceparent");
            }

            @Override
            public <C> void inject(io.micrometer.tracing.TraceContext context, C carrier, Setter<C> setter) {
                setter.set(carrier, "traceparent", "00-" + context.traceId() + "-" + context.spanId() + "-01");
            }

            @Override
            public <C> Span.Builder extract(C carrier, Getter<C> getter) {
                return Span.Builder.NOOP;
            }
        };
        Span span = tracer.nextSpan().name("served").start();
        try (Tracer.SpanInScope _ = tracer.withSpan(span)) {
            HttpRequest sent = new TraceHeaders(tracer, w3c).traced(ASKED);
            assertThat(sent.headers().firstValue("traceparent"))
                    .contains("00-" + span.context().traceId() + "-"
                            + span.context().spanId() + "-01");
        } finally {
            span.end();
        }
    }

    @Test
    void theHealthCheckIsNotObservedAndARequestIs() {
        var predicate = new TracingConfig().noActuatorObservations();
        var health = new org.springframework.http.server.observation.ServerRequestObservationContext(
                new MockHttpServletRequest("GET", "/actuator/health/readiness"), new MockHttpServletResponse());
        var navlog = new org.springframework.http.server.observation.ServerRequestObservationContext(
                new MockHttpServletRequest("GET", "/api/planner/navlog"), new MockHttpServletResponse());
        assertThat(predicate.test("http.server.requests", health)).isFalse();
        assertThat(predicate.test("http.server.requests", navlog)).isTrue();
        var security = new io.micrometer.observation.Observation.Context();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(
                new org.springframework.web.context.request.ServletRequestAttributes(
                        new MockHttpServletRequest("GET", "/actuator/health")));
        try {
            assertThat(predicate.test("spring.security.authorizations", security))
                    .isFalse();
        } finally {
            org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
        }
        assertThat(predicate.test("spring.security.authorizations", security)).isTrue();
    }

    @Test
    void theFilterKeepsAPagesTokenAndMakesOneOtherwise() {
        assertThat(RequestIdFilter.idOf("abc-123_x.y")).isEqualTo("abc-123_x.y");
        assertThat(RequestIdFilter.idOf("not a token\r\nX-Evil: 1")).hasSize(36);
        assertThat(RequestIdFilter.idOf(null)).hasSize(36);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theFilterTagsTheSpanAndAnswersWithTheId() throws Exception {
        SimpleTracer tracer = new SimpleTracer();
        ObjectProvider<Tracer> provider = Mockito.mock(ObjectProvider.class);
        Mockito.when(provider.getIfAvailable()).thenReturn(tracer);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/planner/navlog");
        request.addHeader(RequestIdFilter.HEADER, "page-1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        String[] seen = new String[1];
        Span span = tracer.nextSpan().name("served").start();
        try (Tracer.SpanInScope _ = tracer.withSpan(span)) {
            new RequestIdFilter(provider).doFilter(request, response, new MockFilterChain() {
                @Override
                public void doFilter(jakarta.servlet.ServletRequest req, jakarta.servlet.ServletResponse res) {
                    seen[0] = MDC.get(RequestIdFilter.MDC_KEY);
                }
            });
        } finally {
            span.end();
        }
        assertThat(seen[0]).isEqualTo("page-1");
        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo("page-1");
        assertThat(tracer.onlySpan().getTags()).containsEntry(RequestIdFilter.SPAN_TAG, "page-1");
    }
}
