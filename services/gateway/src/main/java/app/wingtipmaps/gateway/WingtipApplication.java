package app.wingtipmaps.gateway;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the gateway -- the public-facing route-planning API. See
 * {@link app.wingtipmaps.gateway.controller.PlannerProxyController} for the
 * planning surface (proxied to planner) and the other
 * controllers in that package for pilots, aircraft and flights; this
 * class only bootstraps Spring Boot and declares the OpenAPI document's
 * title/description (served at /v3/api-docs).
 */
@SpringBootApplication
@OpenAPIDefinition(
        info =
                @Info(
                        title = "Wingtip Maps API",
                        version = "0.1.0",
                        description = "Scores candidate checkpoints and dead-reckoning nav-log data for a VFR route. "
                                + "See /swagger-ui/index.html for the interactive docs."))
public class WingtipApplication {

    /** How long the JDK's HttpClient keeps an idle connection, in seconds:
     *  under uvicorn's 5 s keep-alive (the planner, the assistant), so a
     *  connection the planner has closed is never taken from the pool for
     *  the next call. Read once, when the JDK's pool is first made, so set
     *  before anything is. PlannerClient also asks a rule again once. */
    static final String KEEP_ALIVE_SECONDS = "4";

    public static void main(String[] args) {
        System.setProperty("jdk.httpclient.keepalive.timeout", KEEP_ALIVE_SECONDS);
        SpringApplication.run(WingtipApplication.class, args);
    }
}
