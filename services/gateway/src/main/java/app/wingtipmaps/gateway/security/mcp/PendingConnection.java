package app.wingtipmaps.gateway.security.mcp;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Optional;
import org.springframework.http.HttpMethod;
import org.springframework.security.web.savedrequest.DefaultSavedRequest;
import org.springframework.security.web.savedrequest.HttpSessionRequestCache;
import org.springframework.security.web.savedrequest.RequestCache;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

/**
 * A connection a pilot started from their AI app before they were signed
 * in here: the authorization request, kept in their session while they
 * sign in, and taken up again after (/connect/continue).
 *
 * <p>Only the authorization server's chain saves a request: the app's
 * own saves none (SecurityConfig), and a sign-in lands where it always
 * did unless a connection is waiting.
 */
public final class PendingConnection {

    static final String ATTRIBUTE = "wingtip.connector.pending";

    private PendingConnection() {}

    static RequestCache cache() {
        HttpSessionRequestCache cache = new HttpSessionRequestCache();
        cache.setSessionAttrName(ATTRIBUTE);
        cache.setRequestMatcher(PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.GET, "/oauth2/authorize"));
        return cache;
    }

    /** Whether this session has a connection waiting for its sign-in. */
    public static boolean waiting(HttpServletRequest request) {
        return saved(request).isPresent();
    }

    /** The client's id, as its waiting authorization request named it. */
    public static Optional<String> clientId(HttpServletRequest request) {
        return saved(request)
                .map(saved -> saved.getParameterValues("client_id"))
                .filter(values -> values.length == 1)
                .map(values -> values[0]);
    }

    /** The waiting request's address on this app, taken out of the
     *  session: it is followed once. */
    public static Optional<String> take(HttpServletRequest request) {
        Optional<String> url = saved(request)
                .map(saved ->
                        saved.getRequestURI() + (saved.getQueryString() == null ? "" : "?" + saved.getQueryString()));
        url.ifPresent(found -> request.getSession().removeAttribute(ATTRIBUTE));
        return url;
    }

    private static Optional<DefaultSavedRequest> saved(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        return session != null && session.getAttribute(ATTRIBUTE) instanceof DefaultSavedRequest saved
                ? Optional.of(saved)
                : Optional.empty();
    }
}
