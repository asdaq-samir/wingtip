package app.wingtipmaps.gateway.monitoring;

import app.wingtipmaps.gateway.upstream.UpstreamClients;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.boot.http.client.HttpClientSettings;
import org.springframework.boot.http.client.HttpRedirects;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * One look at a service: a GET with a short wait, its status and body, or
 * why there was none. Pinned to HTTP/1.1 as the planner's clients are (the
 * planner and the weather service are uvicorn and Python's
 * own server), and nothing else rides with it: a RestClient of its own,
 * not Boot's, so no session, no trace and no request id.
 */
@Component
public class HealthProbe {

    /** What a look found: the status (0 where nothing answered) and the
     *  body, or why nothing answered. */
    public record Answer(int status, String body) {
        boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    /** A service that takes longer than this to say it is up is not well. */
    static final Duration WAIT = Duration.ofSeconds(10);

    private final RestClient http = RestClient.builder()
            .requestFactory(UpstreamClients.HTTP_1_1.build(
                    HttpClientSettings.defaults().withTimeouts(WAIT, WAIT).withRedirects(HttpRedirects.DONT_FOLLOW)))
            .build();

    /** The answer at {@code url}, whatever its status; never throws. */
    public Answer get(String url) {
        try {
            return http.get()
                    .uri(url)
                    .exchange((request, response) -> new Answer(
                            response.getStatusCode().value(),
                            new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8)));
        } catch (RestClientException | IllegalArgumentException e) {
            Throwable why = NestedExceptionUtils.getMostSpecificCause(e);
            return new Answer(
                    0, why.getClass().getSimpleName() + (why.getMessage() == null ? "" : ": " + why.getMessage()));
        }
    }
}
