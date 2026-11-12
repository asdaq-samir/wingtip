package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.dto.SharedFlightDto;
import app.wingtipmaps.gateway.service.FlightShareService;
import io.swagger.v3.oas.annotations.Hidden;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * A shared flight's link (`/app/plan?open=shared&...`, design/screens.json)
 * as Messages, Slack and the like preview it: the web app's own page, its
 * Open Graph title the route ("KMSN → KOSH · 3,500 ft"), its line the
 * departure time and airplane, and for a saved flight's share the route
 * drawn (FlightShareController's image). A preview's fetcher runs no
 * script, so the page the browser gets is index.html with those tags
 * written in; the app itself then reads the link as any other.
 *
 * <p>Only the link's own words are written, each escaped: a plain link's
 * keys are checked to be idents, feet and a time first, and anything else
 * gets the app's own preview. Every other /app/plan is the page as it
 * is built.
 */
@Hidden
@RestController
public class SharePreviewController {

    /** An ident as the planner takes one (FlightController's shape). */
    private static final Pattern IDENT = Pattern.compile("[A-Z0-9]{2,8}");

    private static final Pattern META =
            Pattern.compile("<meta property=\"og:(title|description|image)\" content=\"[^\"]*\" />");

    private final FlightShareService shares;
    private final ResourceLoader resources;
    private final String staticLocation;

    public SharePreviewController(FlightShareService shares, ResourceLoader resources, AppProperties app) {
        String staticLocation = app.staticLocation();
        this.shares = shares;
        this.resources = resources;
        this.staticLocation = staticLocation;
    }

    /** What the preview says: its title, its line and its picture. */
    record Preview(
            String title, String description, @Nullable String image) {}

    /** The planner's page, every address of it: a mapping that matched
     *  only `open=shared` answered every other /app/plan with a 400 (Spring
     *  refuses a path whose parameters do not match, rather than passing it
     *  on to the static handler), so this serves the page itself, as that
     *  handler did, and writes the preview in only for a shared flight's. */
    @GetMapping("/app/plan")
    public ResponseEntity<String> page(
            @RequestParam(required = false) @Nullable String open,
            @RequestParam(required = false) @Nullable String share,
            @RequestParam(required = false) @Nullable String dep,
            @RequestParam(required = false) @Nullable String dest,
            @RequestParam(required = false) @Nullable String stops,
            @RequestParam(name = "altitude_ft", required = false) @Nullable String altitudeFt,
            @RequestParam(required = false) @Nullable String type,
            @RequestParam(required = false) @Nullable String rules)
            throws IOException {
        Resource index = resources.getResource(staticLocation + "index.html");
        if (!index.isReadable()) {
            return ResponseEntity.notFound().build();
        }
        String html;
        try (InputStream in = index.getInputStream()) {
            html = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        Optional<Preview> preview = !"shared".equals(open)
                ? Optional.empty()
                : share != null
                        ? shares.shared(share).map(f -> ofSaved(f, FlightShareController.origin(), share))
                        : ofPlain(dep, dest, stops, altitudeFt, type, rules);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                // UTF-8 named: the route's arrows, which a String body
                // would otherwise be sent in ISO-8859-1 without.
                .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                .body(preview.map(p -> written(html, p)).orElse(html));
    }

    static Preview ofSaved(SharedFlightDto f, String origin, String token) {
        String title = title(f.departureIdent(), f.stops(), f.destinationIdent(), f.cruiseAltitudeFt());
        List<String> line = new ArrayList<>();
        if (f.aircraftType() != null) {
            line.add(f.aircraftType());
        }
        line.add("Open the route, altitude and nav log in Wingtip Maps");
        return new Preview(title, String.join(" · ", line), origin + "/api/shared-flights/" + token + "/image.png");
    }

    static Optional<Preview> ofPlain(
            @Nullable String dep,
            @Nullable String dest,
            @Nullable String stops,
            @Nullable String altitudeFt,
            @Nullable String type,
            @Nullable String rules) {
        String from = ident(dep);
        String to = ident(dest);
        if (from == null || to == null) {
            return Optional.empty();
        }
        List<String> via = new ArrayList<>();
        if (stops != null) {
            for (String stop : stops.split(",")) {
                String s = ident(stop);
                if (s != null) {
                    via.add(s);
                }
            }
        }
        Integer feet = altitudeFt != null && altitudeFt.matches("\\d{3,5}") ? Integer.valueOf(altitudeFt) : null;
        List<String> line = new ArrayList<>();
        String airplane = ident(type);
        if (airplane != null) {
            line.add(airplane);
        }
        if ("vfr".equalsIgnoreCase(rules) || "ifr".equalsIgnoreCase(rules)) {
            line.add(rules.toUpperCase(Locale.ROOT));
        }
        line.add("Open the route, altitude and nav log in Wingtip Maps");
        return Optional.of(new Preview(title(from, via, to, feet), String.join(" · ", line), null));
    }

    /** "KMSN → KJVL → KOSH · 3,500 ft": the route and its cruise altitude
     *  in feet MSL, as the planner plans it. */
    static String title(String dep, List<String> stops, String dest, @Nullable Integer feet) {
        List<String> route = new ArrayList<>();
        route.add(dep);
        route.addAll(stops);
        route.add(dest);
        String path = String.join(" → ", route);
        return feet == null ? path : path + " · " + String.format(Locale.US, "%,d ft", feet);
    }

    /** The page with the preview's words in its Open Graph tags. */
    static String written(String html, Preview p) {
        Matcher m = META.matcher(html);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String value = switch (m.group(1)) {
                case "title" -> p.title();
                case "description" -> p.description();
                default -> p.image();
            };
            String tag = value == null
                    ? m.group()
                    : "<meta property=\"og:" + m.group(1) + "\" content=\"" + escaped(value) + "\" />";
            m.appendReplacement(out, Matcher.quoteReplacement(tag));
        }
        m.appendTail(out);
        String page = out.toString();
        if (p.image() != null) {
            page = page.replace(
                    "<meta name=\"twitter:card\" content=\"summary\" />",
                    "<meta name=\"twitter:card\" content=\"summary_large_image\" />");
        }
        return page.replaceFirst(
                "<title>[^<]*</title>", Matcher.quoteReplacement("<title>" + escaped(p.title()) + "</title>"));
    }

    private static @Nullable String ident(@Nullable String raw) {
        if (raw == null) {
            return null;
        }
        String text = raw.strip().toUpperCase(Locale.ROOT);
        return IDENT.matcher(text).matches() ? text : null;
    }

    private static String escaped(String text) {
        return text.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }
}
