package app.wingtipmaps.gateway.controller;

import static org.springframework.web.util.HtmlUtils.htmlEscape;

/**
 * The pages of deleting an account without the app (DeleteAccountController),
 * in ConnectPages' frame and style: plain HTML, every value escaped, no
 * script. What they say is gone is what AccountService deletes, and what
 * the privacy policy lists (docs/legal/privacy.md, "Deleting your account").
 */
final class DeleteAccountPages {

    private static final String WHAT_GOES = "<p>Deleting the account removes, at once and for good: your account and"
            + " sign-in, your airplanes and squawks, saved flights with their nav logs, tracks, share links and"
            + " flight watches, your logbook and endorsements, your own checkpoint notes, reminders, and the AI"
            + " apps you connected. Settings kept on a phone stay there until you delete the app.</p>";

    private DeleteAccountPages() {}

    /** Your address, to be emailed the link. */
    static String ask(String csrfName, String csrfToken, String notice) {
        StringBuilder body = new StringBuilder()
                .append("<h1>Delete your Wingtip Maps account</h1>")
                .append("<p>Enter the email address you sign in to Wingtip Maps with. We email it a link;")
                .append(" open it and press Delete Account. You don't need the app.</p>")
                .append(WHAT_GOES);
        if (!notice.isEmpty()) {
            body.append("<p class=\"muted\" role=\"status\">")
                    .append(htmlEscape(notice))
                    .append("</p>");
        }
        return body.append("<form method=\"post\" action=\"/delete-account\">")
                .append(hidden(csrfName, csrfToken))
                .append("<label for=\"email\">Email</label>")
                .append("<input id=\"email\" type=\"email\" name=\"email\" required autocomplete=\"email\">")
                .append("<button class=\"button\" type=\"submit\">Email Me a Deletion Link</button></form>")
                .append("<p class=\"muted\">Signed in to Wingtip Maps on a phone or the web? Setup, then Delete")
                .append(" Account, does the same without an email.</p>")
                .toString();
    }

    /** The link opened: which account, and the button that deletes it. */
    static String confirm(String email, String token, String csrfName, String csrfToken) {
        return "<h1>Delete this account?</h1><p>The Wingtip Maps account for <span class=\"host\">"
                + htmlEscape(email) + "</span> will be deleted. This can't be undone.</p>" + WHAT_GOES
                + "<form method=\"post\" action=\"/delete-account/confirm\">" + hidden(csrfName, csrfToken)
                + hidden("token", token) + "<button class=\"button\" type=\"submit\">Delete Account</button></form>"
                + "<a class=\"button plain\" href=\"/\">Keep My Account</a>";
    }

    static String deleted() {
        return "<h1>Your account is deleted</h1><p>Everything listed was removed. You can still use Wingtip Maps"
                + " without an account, or make a new one by signing in again.</p>";
    }

    static String expired() {
        return "<h1>This link has expired or was used</h1><p>Deletion links work once, for 15 minutes.</p>"
                + "<a class=\"button\" href=\"/delete-account\">Ask for a New Link</a>";
    }

    static String notDeleted() {
        return "<h1>Your account was not deleted</h1><p>Part of Wingtip Maps did not answer, so nothing was"
                + " removed. Ask for a new link and try again shortly.</p>"
                + "<a class=\"button\" href=\"/delete-account\">Ask for a New Link</a>";
    }

    private static String hidden(String name, String value) {
        return "<input type=\"hidden\" name=\"" + htmlEscape(name) + "\" value=\"" + htmlEscape(value) + "\">";
    }
}
