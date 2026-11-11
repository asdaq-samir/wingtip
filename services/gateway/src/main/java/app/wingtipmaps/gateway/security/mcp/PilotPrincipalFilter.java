package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.service.PilotService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * On the authorization server's endpoints, the signed-in pilot as their
 * id: the principal an authorization and a consent are kept under, and
 * the subject of the tokens issued from them.
 *
 * <p>The session holds whoever signed in -- a Google or Apple user, an
 * emailed link's address -- and the authorization server keeps its
 * principal in Postgres as JSON, which Spring writes only for its own
 * kinds of authentication. The pilot's id, in Spring's own kind, is what
 * every token here is about anyway. Set for this request only, never saved
 * to the session: the app's own sign-in is left as it was.
 */
final class PilotPrincipalFilter extends OncePerRequestFilter {

    private final PilotService pilots;

    PilotPrincipalFilter(PilotService pilots) {
        this.pilots = pilots;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication signedIn = SecurityContextHolder.getContext().getAuthentication();
        if (signedIn != null && signedIn.isAuthenticated()) {
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            // A principal that is no pilot of this app (none it issues) is
            // signed out here, and asked to sign in.
            pilots.current(signedIn)
                    .ifPresent(pilot -> context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                            String.valueOf(pilot.getId()), null, List.of())));
            SecurityContextHolder.setContext(context);
        }
        chain.doFilter(request, response);
    }
}
