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
    public static void main(String[] args) {
        SpringApplication.run(WingtipApplication.class, args);
    }
}
