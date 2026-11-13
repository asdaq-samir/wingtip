package app.wingtipmaps.gateway.upstream;

import app.wingtipmaps.gateway.service.PlannerClient;
import java.time.Duration;
import org.springframework.boot.http.client.HttpClientSettings;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.support.RestClientAdapter;
import org.springframework.web.service.invoker.HttpServiceProxyFactory;

/** The planner's clients as UpstreamClients has Boot
 *  make them, for a test that starts no application: the same HTTP/1.1
 *  JDK client, at a stub's address. */
public final class Upstreams {

    private Upstreams() {}

    public static <T> T client(Class<T> type, String baseUrl) {
        RestClient rest = RestClient.builder()
                .baseUrl(baseUrl.replaceAll("/+$", ""))
                .requestFactory(UpstreamClients.HTTP_1_1.build(
                        HttpClientSettings.defaults().withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(20))))
                .build();
        return HttpServiceProxyFactory.builderFor(RestClientAdapter.create(rest))
                .build()
                .createClient(type);
    }

    public static PlannerClient plannerClient(String plannerUrl) {
        return new PlannerClient(client(PlannerApi.class, plannerUrl), client(BriefingApi.class, plannerUrl));
    }
}
