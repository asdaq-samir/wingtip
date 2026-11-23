package app.wingtipmaps.gateway.config;

import jakarta.servlet.Filter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;

/**
 * What a request looked like to the app once Tomcat's RemoteIpValve had
 * read it, before any of the app's filters: its remote address, whether
 * it is secure, its host and its port. For RemoteIpTest and RemoteIpLanTest.
 */
@TestConfiguration
class RemoteIpEcho {

    static final String PATH = "/remote-ip-echo";

    @Bean
    FilterRegistrationBean<Filter> remoteIpEcho() {
        FilterRegistrationBean<Filter> echo = new FilterRegistrationBean<>((request, response, chain) -> {
            response.setContentType("text/plain");
            response.getWriter()
                    .write(request.getRemoteAddr() + " " + request.isSecure() + " " + request.getServerName() + " "
                            + request.getServerPort());
        });
        echo.addUrlPatterns(PATH);
        echo.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return echo;
    }

    /** Asked over loopback with every forwarded header a caller could write. */
    static String ask(int port) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + PATH))
                .header("X-Forwarded-For", "198.51.100.1, 203.0.113.9")
                .header("X-Forwarded-Proto", "https")
                .header("X-Forwarded-Host", "attacker.example")
                .header("X-Forwarded-Port", "4444")
                .build();
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request, HttpResponse.BodyHandlers.ofString()).body();
        }
    }
}
