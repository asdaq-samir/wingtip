package app.wingtipmaps.gateway.controller;

import static org.springframework.web.util.HtmlUtils.htmlEscape;

import app.wingtipmaps.gateway.security.mcp.ConnectorSettings;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * The few pages a pilot sees while connecting their AI app: written here
 * as plain HTML, every value escaped, styled as the privacy policy is
 * (apps/web/public/privacy.html: the system font, light and dark), and
 * with no script, which the content policy here allows none of.
 */
final class ConnectPages {

    /** What each scope lets the AI app do, in the pilot's words. */
    static final Map<String, String> SCOPE_WORDS = Map.of(
            ConnectorSettings.READ, "Read your airplanes and saved flights, and plan with them",
            ConnectorSettings.WRITE, "Save flights to your Wingtip account");

    private static final String STYLE = """
            :root { --fg: #111; --muted: #555; --bg: #fff; --tint: #0066cc; --rule: #ddd; }
            @media (prefers-color-scheme: dark) {
              :root { --fg: #f2f2f2; --muted: #aaa; --bg: #000; --tint: #4da3ff; --rule: #333; }
            }
            body { margin: 0 auto; max-width: 32rem; padding: 2rem 1.25rem 3rem; color: var(--fg);
              background: var(--bg); font: 17px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif; }
            h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
            p, li { margin: .5rem 0; }
            .muted { color: var(--muted); font-size: .95rem; }
            .host { font-weight: 600; word-break: break-all; }
            form { margin: 1rem 0; }
            input[type=email] { box-sizing: border-box; width: 100%; font: inherit; padding: .6rem .75rem;
              border: 1px solid var(--rule); border-radius: .5rem; background: var(--bg); color: var(--fg); }
            .button { display: block; box-sizing: border-box; width: 100%; margin: .5rem 0; padding: .7rem 1rem;
              font: inherit; font-weight: 600; text-align: center; text-decoration: none; border-radius: .6rem;
              border: 1px solid var(--tint); background: var(--tint); color: #fff; cursor: pointer; }
            .button.plain { background: transparent; color: var(--tint); }
            """;

    private ConnectPages() {}

    static ResponseEntity<String> page(String title, String body) {
        String html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">"
                + "<meta name=\"color-scheme\" content=\"light dark\">"
                + "<title>" + htmlEscape(title) + " — Wingtip Maps</title>"
                + "<link rel=\"icon\" href=\"/app/favicon.svg\" type=\"image/svg+xml\">"
                + "<style>" + STYLE + "</style></head><body>" + body + "</body></html>";
        return ResponseEntity.ok()
                .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                .body(html);
    }

    /** Sign in first, by any way this deployment offers. */
    static String signIn(String clientName, List<String> providers, String csrfName, String csrfToken, String notice) {
        StringBuilder body = new StringBuilder()
                .append("<h1>Sign in to connect ")
                .append(htmlEscape(clientName))
                .append("</h1><p>Sign in to Wingtip Maps, and ")
                .append(htmlEscape(clientName))
                .append(" can then plan with your airplanes and flights.</p>");
        if (!notice.isEmpty()) {
            body.append("<p class=\"muted\">").append(htmlEscape(notice)).append("</p>");
        }
        for (String provider : providers) {
            body.append("<a class=\"button plain\" href=\"/oauth2/authorization/")
                    .append(htmlEscape(provider))
                    .append("\">Continue with ")
                    .append(htmlEscape(capitalised(provider)))
                    .append("</a>");
        }
        body.append("<form method=\"post\" action=\"/api/auth/magic-link\">")
                .append("<input type=\"hidden\" name=\"")
                .append(htmlEscape(csrfName))
                .append("\" value=\"")
                .append(htmlEscape(csrfToken))
                .append("\"><label for=\"email\">Email</label>")
                .append("<input id=\"email\" type=\"email\" name=\"email\" required autocomplete=\"email\">")
                .append("<button class=\"button\" type=\"submit\">Email Me a Sign-In Link</button></form>")
                .append("<p class=\"muted\">Open the link on this device, in this browser,")
                .append(" and you come back here to finish.</p>");
        return body.toString();
    }

    /** Signed in: carry on with the connection the AI app asked for. */
    static String carryOn(String authorizeUrl) {
        return "<h1>You are signed in</h1><p>Continue to choose what your AI app may do.</p>"
                + "<a class=\"button\" href=\"" + htmlEscape(authorizeUrl) + "\">Continue</a>";
    }

    static String nothingWaiting() {
        return "<h1>Nothing to connect</h1><p>Start again from your AI app: add the Wingtip Maps connector,"
                + " or connect it again.</p><a class=\"button plain\" href=\"/app/plan\">Open Wingtip Maps</a>";
    }

    /** The pilot's consent: who asks, where the answer goes, and for what. */
    static String consent(String clientName, String redirectHost, String clientId, String state, List<String> scopes) {
        StringBuilder body = new StringBuilder()
                .append("<h1>Connect ")
                .append(htmlEscape(clientName))
                .append(" to Wingtip Maps?</h1><p>Your answer is sent to <span class=\"host\">")
                .append(htmlEscape(redirectHost))
                .append("</span>. Connect only if that is the AI app you are using.</p><p>It will be able to:</p><ul>");
        for (String scope : scopes) {
            body.append("<li>")
                    .append(htmlEscape(SCOPE_WORDS.getOrDefault(scope, scope)))
                    .append("</li>");
        }
        body.append("</ul><p class=\"muted\">Only what you ask it about leaves Wingtip, and only to this app.")
                .append(" You can remove the connector in that app's settings at any time.</p>")
                .append("<form method=\"post\" action=\"/oauth2/authorize\">")
                .append(hidden("client_id", clientId))
                .append(hidden("state", state));
        for (String scope : scopes) {
            body.append(hidden("scope", scope));
        }
        body.append("<button class=\"button\" type=\"submit\">Connect</button></form>")
                .append("<form method=\"post\" action=\"/oauth2/authorize\">")
                .append(hidden("client_id", clientId))
                .append(hidden("state", state))
                .append("<button class=\"button plain\" type=\"submit\">Don't Connect</button></form>");
        return body.toString();
    }

    private static String hidden(String name, String value) {
        return "<input type=\"hidden\" name=\"" + htmlEscape(name) + "\" value=\"" + htmlEscape(value) + "\">";
    }

    private static String capitalised(String provider) {
        return provider.isEmpty() ? provider : Character.toUpperCase(provider.charAt(0)) + provider.substring(1);
    }
}
