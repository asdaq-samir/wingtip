package app.wingtipmaps.gateway.tracing;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The page's request id ({@code X-Request-Id}, which the web app's API
 * client sends on each call, apps/web/src/lib/api/requestId.ts), or one
 * made here when there is none: on the log lines of the request
 * ({@code requestId} in the MDC, logging.pattern.correlation), on its
 * span as {@code wingtip.request_id} where tracing is on, so Jaeger finds
 * the trace by the id a pilot's page saw, back on the response, and on to
 * the planner ({@link TraceHeaders}).
 *
 * <p>Ordered just after Spring's ServerHttpObservationFilter
 * (HIGHEST_PRECEDENCE + 1), so the request's span is current when it is
 * tagged, and before Spring Security, so a refused request has its id
 * too. An id that is not a short token is not taken as one: it is
 * written into logs and headers.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";
    public static final String SPAN_TAG = "wingtip.request_id";

    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    private final ObjectProvider<Tracer> tracer;

    public RequestIdFilter(ObjectProvider<Tracer> tracer) {
        this.tracer = tracer;
    }

    /** The id the page sent where it is a token, else a new one. */
    static String idOf(String sent) {
        return sent != null && TOKEN.matcher(sent).matches()
                ? sent
                : UUID.randomUUID().toString();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String id = idOf(request.getHeader(HEADER));
        Tracer current = tracer.getIfAvailable();
        Span span = current == null ? null : current.currentSpan();
        if (span != null) {
            span.tag(SPAN_TAG, id);
        }
        response.setHeader(HEADER, id);
        MDC.put(MDC_KEY, id);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
