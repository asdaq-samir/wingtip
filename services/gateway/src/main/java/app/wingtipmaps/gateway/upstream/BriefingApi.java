package app.wingtipmaps.gateway.upstream;

import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.service.annotation.GetExchange;
import org.springframework.web.service.annotation.HttpExchange;

/**
 * The flight's briefing, as the planner writes it, carried as its JSON and
 * never read here. A group of its own ("briefing", application.yml) for
 * its longer wait: it reads the weather along the route, tens of seconds
 * when aviationweather.gov is slow.
 */
@HttpExchange
public interface BriefingApi {

    /** A parameter left null is not sent. */
    @GetExchange("/api/briefing")
    String briefing(
            @RequestParam String dep,
            @RequestParam String dest,
            @RequestParam(required = false) @Nullable String stops,
            @RequestParam String depart,
            @RequestParam(name = "ete_min", required = false) @Nullable Double eteMin);
}
