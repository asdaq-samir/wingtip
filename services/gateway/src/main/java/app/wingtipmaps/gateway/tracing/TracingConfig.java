package app.wingtipmaps.gateway.tracing;

import io.micrometer.observation.ObservationPredicate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.observation.ServerRequestObservationContext;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The container's health check asks /actuator/health every few seconds;
 * as a trace each, they buried the pilots' requests in Jaeger. Nothing
 * done for a request under /actuator is observed -- the request itself
 * nor Spring Security's work on it -- so it makes no span.
 */
@Configuration(proxyBeanMethods = false)
public class TracingConfig {

    static boolean isActuator(String uri) {
        return uri != null && uri.startsWith("/actuator");
    }

    @Bean
    ObservationPredicate noActuatorObservations() {
        return (name, context) -> {
            if (context instanceof ServerRequestObservationContext request) {
                return !isActuator(request.getCarrier().getRequestURI());
            }
            // Spring Security's observations, inside the request: the
            // request is RequestContextFilter's by then.
            return !(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                    && isActuator(attributes.getRequest().getRequestURI()));
        };
    }
}
