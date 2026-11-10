package app.wingtipmaps.gateway.security;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.security.mcp.PendingConnection;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Where a sign-in lands: a developer in dev mode, where their work is,
 * anyone else on the planner. One answer for both ways in -- the emailed
 * link (MagicLinkController) and Google/Apple (SecurityConfig).
 */
public final class SignInLanding {

    /** The page that takes a waiting connection up again. */
    public static final String CONTINUE_CONNECTING = "/connect/continue";

    private SignInLanding() {}

    public static String after(Pilot pilot) {
        return pilot.getRole().isDeveloper() ? "/app/dev" : "/app/plan";
    }

    /**
     * As above, unless the pilot signed in to connect their AI app
     * (PendingConnection): then the page that carries on with it. A page
     * rather than the authorization request itself: the emailed link's
     * sign-in is a fetch() that follows redirects
     * (apps/web/src/lib/api/client.ts finishMagicLink), and following one
     * to the AI app's callback would spend the code where nobody reads it.
     */
    public static String after(Pilot pilot, HttpServletRequest request) {
        return PendingConnection.waiting(request) ? CONTINUE_CONNECTING : after(pilot);
    }
}
