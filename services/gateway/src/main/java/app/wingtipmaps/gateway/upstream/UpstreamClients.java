package app.wingtipmaps.gateway.upstream;

import app.wingtipmaps.gateway.tracing.RequestIdFilter;
import java.net.http.HttpClient;
import org.slf4j.MDC;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.JdkClientHttpRequestFactoryBuilder;
import org.springframework.boot.restclient.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.service.registry.ImportHttpServices;

/**
 * The clients of the planner, made by Boot from Spring's
 * HTTP interfaces: each group's address and waits are application.yml's
 * {@code spring.http.serviceclient}, and Boot's observation traces each
 * call under the request being served. Every RestClient Boot builds here is
 * the JDK's HttpClient pinned to HTTP/1.1, for the reason StreamingProxy
 * gives: the planner behind this one is uvicorn, and a pooled connection
 * that attempted an HTTP/2 upgrade corrupted the next request on it.
 */
@Configuration(proxyBeanMethods = false)
@ImportHttpServices(group = "planner", types = PlannerApi.class)
@ImportHttpServices(group = "briefing", types = BriefingApi.class)
public class UpstreamClients {

    /** The JDK's client, pinned to HTTP/1.1: Boot's, and HealthProbe's. */
    public static final JdkClientHttpRequestFactoryBuilder HTTP_1_1 = ClientHttpRequestFactoryBuilder.jdk()
            .withHttpClientCustomizer(client -> client.version(HttpClient.Version.HTTP_1_1));

    @Bean
    ClientHttpRequestFactoryBuilder<?> http11() {
        return HTTP_1_1;
    }

    /** The page's request id (RequestIdFilter) on each call, beside the
     *  trace's headers Boot's observation puts there, so the planner's log
     *  lines for it carry the same id. */
    @Bean
    RestClientCustomizer requestId() {
        return builder -> builder.requestInterceptor((request, body, execution) -> {
            String id = MDC.get(RequestIdFilter.MDC_KEY);
            if (id != null) {
                request.getHeaders().set(RequestIdFilter.HEADER, id);
            }
            return execution.execute(request, body);
        });
    }
}
