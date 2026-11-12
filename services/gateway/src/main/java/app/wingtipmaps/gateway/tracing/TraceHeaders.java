package app.wingtipmaps.gateway.tracing;

import io.micrometer.tracing.TraceContext;
import io.micrometer.tracing.Tracer;
import io.micrometer.tracing.propagation.Propagator;
import java.net.http.HttpRequest;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * What every request the browser's proxy (StreamingProxy) makes of the
 * planner or the assistant carries so the trace goes on through it: the
 * W3C {@code traceparent} of the request being served (where
 * management.tracing is on) and the page's request id
 * ({@link RequestIdFilter}). The proxy pipes through the JDK's HttpClient
 * itself, which Micrometer does not instrument, so the headers are put on
 * here; the RestClients Boot makes (UpstreamClients) are traced by Boot.
 *
 * <p>With tracing off there is no current context, and a request with no
 * request id in hand goes out as it was built.
 */
@Component
public class TraceHeaders {

    /** For what is built outside Spring (tests, a plain constructor):
     *  nothing to propagate but the request id. */
    public static final TraceHeaders NONE = new TraceHeaders((Tracer) null, null);

    private final Tracer tracer;
    private final Propagator propagator;

    @Autowired
    public TraceHeaders(ObjectProvider<Tracer> tracer, ObjectProvider<Propagator> propagator) {
        this(tracer.getIfAvailable(), propagator.getIfAvailable());
    }

    TraceHeaders(Tracer tracer, Propagator propagator) {
        this.tracer = tracer;
        this.propagator = propagator;
    }

    /** {@code request} with the current trace's headers and the request
     *  id, or as it is where there are neither. */
    public HttpRequest traced(HttpRequest request) {
        TraceContext context = tracer == null || propagator == null
                ? null
                : tracer.currentTraceContext().context();
        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        if (context == null && requestId == null) {
            return request;
        }
        HttpRequest.Builder builder = HttpRequest.newBuilder(request, (name, value) -> true);
        if (requestId != null) {
            builder.setHeader(RequestIdFilter.HEADER, requestId);
        }
        if (context != null) {
            propagator.inject(context, builder, (carrier, key, value) -> carrier.setHeader(key, value));
        }
        return builder.build();
    }
}
