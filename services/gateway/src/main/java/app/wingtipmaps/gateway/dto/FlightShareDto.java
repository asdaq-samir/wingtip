package app.wingtipmaps.gateway.dto;

import app.wingtipmaps.gateway.domain.FlightShare;
import java.time.Instant;

/** A saved flight's share, as its own pilot sees it: the link to send,
 *  whether the N-number goes with it, and since when it is shared. */
public record FlightShareDto(
        /* The share's token, the link's `share` key (design/screens.json). */
        String token,
        /* The link to send: the planner's address with the flight's preview
         *  open (`/app/plan?open=shared&share=<token>`), which opens the app
         *  where it is installed and the web otherwise. */
        String url,
        /* Whether the airplane's N-number is shown with it. */
        boolean includeTail,
        Instant sharedAt) {

    /** The share's link at the site's own address (`origin`, with no
     *  trailing slash). */
    public static FlightShareDto of(FlightShare share, String origin) {
        return new FlightShareDto(
                share.getToken(),
                origin + "/app/plan?open=shared&share=" + share.getToken(),
                share.isIncludeTail(),
                share.getSharedAt());
    }
}
