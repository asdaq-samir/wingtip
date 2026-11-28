package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.FlightShareDto;
import app.wingtipmaps.gateway.dto.ShareFlightRequest;
import app.wingtipmaps.gateway.dto.SharedFlightDto;
import app.wingtipmaps.gateway.service.FlightShareService;
import app.wingtipmaps.gateway.service.RouteImage;
import io.swagger.v3.oas.annotations.Hidden;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * A saved flight shared by link (docs/navigation.md, Sharing a flight):
 * its pilot shares it and stops sharing it from the saved flight's menu;
 * whoever has the link reads it, signed in or not, read-only, until then.
 */
@RestController
public class FlightShareController {

    private final FlightShareService shares;
    private final String publicBaseUrl;

    public FlightShareController(FlightShareService shares, AppProperties app) {
        this.shares = shares;
        this.publicBaseUrl = app.publicBaseUrl();
    }

    /** The site's own address, for a link to send: APP_PUBLIC_BASE_URL,
     *  which every deployment that mails sets, as the emailed links are
     *  built from it; else (a machine that sends nothing) the request's
     *  own, whose host Tomcat takes from X-Forwarded-Host only from a
     *  trusted proxy (application.yml). It once followed X-Forwarded-Host from
     *  any caller. */
    static String origin(String publicBaseUrl) {
        return publicBaseUrl.isBlank()
                ? ServletUriComponentsBuilder.fromCurrentContextPath()
                        .replacePath(null)
                        .replaceQuery(null)
                        .toUriString()
                : publicBaseUrl.replaceAll("/+$", "");
    }

    /** Shares one of the pilot's flights by link, or changes whether its
     *  N-number goes with a share already made; the same link either way
     *  (a new one only after Stop Sharing). 404 where it is not theirs. */
    @PostMapping("/api/flights/{id}/share")
    public ResponseEntity<FlightShareDto> share(
            Pilot pilot, @PathVariable Long id, @RequestBody(required = false) ShareFlightRequest request) {
        boolean includeTail = request != null && request.includeTail();
        return ResponseEntity.of(
                shares.share(pilot, id, includeTail).map(s -> FlightShareDto.of(s, origin(publicBaseUrl))));
    }

    /** Stops sharing one of the pilot's flights: its link answers 404 from
     *  now on, for everyone it was sent to. 204, or 404 where it is not theirs. */
    @DeleteMapping("/api/flights/{id}/share")
    public ResponseEntity<Void> stop(Pilot pilot, @PathVariable Long id) {
        return PilotResponses.done(shares.stop(pilot, id));
    }

    /** A flight shared with whoever has its link: the plan and its nav log,
     *  nothing of its pilot's own (SharedFlightDto). 404 for a link that is
     *  not, or no longer, a share. Never kept by a cache, so a stop is at
     *  once. */
    @GetMapping("/api/shared-flights/{token}")
    public ResponseEntity<SharedFlightDto> shared(@PathVariable String token) {
        return shares.shared(token)
                .map(f ->
                        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(f))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** The shared flight's route drawn, for its link's preview in Messages
     *  and the like (the og:image SharePreviewController names). Kept a
     *  few minutes: a preview is fetched once, and a stop shows within them. */
    @Hidden
    @GetMapping(value = "/api/shared-flights/{token}/image.png", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> image(@PathVariable String token) {
        return shares.shared(token)
                .map(f -> ResponseEntity.ok()
                        .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                        .contentType(MediaType.IMAGE_PNG)
                        .body(RouteImage.png(f.checkpoints())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
