package app.wingtipmaps.gateway.monitoring;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.stereotype.Component;

/**
 * One look at a service: a GET with a short wait, its status and body, or
 * why there was none. Pinned to HTTP/1.1 as PlannerClient is (the
 * planner, the assistant and the weather service are uvicorn and Python's
 * own server), and nothing else rides with it: no session, no trace.
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

    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(WAIT)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    /** The answer at {@code url}; never throws. */
    public Answer get(String url) {
        try {
            HttpResponse<String> response = http.send(
                    HttpRequest.newBuilder(URI.create(url)).GET().timeout(WAIT).build(),
                    HttpResponse.BodyHandlers.ofString());
            return new Answer(response.statusCode(), response.body());
        } catch (IOException | IllegalArgumentException e) {
            return new Answer(0, e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Answer(0, "interrupted");
        }
    }
}
