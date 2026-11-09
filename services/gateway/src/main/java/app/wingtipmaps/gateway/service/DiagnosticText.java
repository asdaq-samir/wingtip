package app.wingtipmaps.gateway.service;

import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * A device's report made safe to keep (DiagnosticsService): whatever of
 * the pilot's could ride in an error's text is cut out before it is
 * written anywhere.
 *
 * <ul>
 *   <li>the query and fragment of any address -- a fetch error carries
 *   the pilot's position there, a magic link its token;</li>
 *   <li>email addresses;</li>
 *   <li>the user's name in a home folder's path (/Users/name, /home/name);</li>
 *   <li>UUIDs, which on a phone name the app's install (its container
 *   folder) and could follow one device from report to report.</li>
 * </ul>
 *
 * A one-line field is put on one line, so one report cannot forge the
 * look of another in the log.
 */
public final class DiagnosticText {

    private static final Pattern QUERY = Pattern.compile("[?#]\\S*");
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern HOME = Pattern.compile("(/(?:Users|home)/)[^/\\s]+");
    private static final Pattern UUID =
            Pattern.compile("\\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\b");

    private DiagnosticText() {}

    /** Text with nothing of the pilot's left in it, cut to {@code max}. */
    public static String scrub(String text, int max) {
        if (text == null) {
            return null;
        }
        String clean = QUERY.matcher(text).replaceAll("");
        clean = EMAIL.matcher(clean).replaceAll("<email>");
        clean = HOME.matcher(clean).replaceAll("$1~");
        clean = UUID.matcher(clean).replaceAll("<id>");
        return clean.length() > max ? clean.substring(0, max) : clean;
    }

    /** {@link #scrub} on one line. */
    public static String oneLine(String text, int max) {
        String clean = scrub(text, max);
        return clean == null ? "" : clean.replaceAll("[\\r\\n]+", " ");
    }

    /** A stack or payload with every line indented, so none can start a
     *  log line of its own. */
    public static String indented(String text) {
        if (text == null) {
            return "";
        }
        return text.lines().map(line -> "    " + line).collect(Collectors.joining("\n"));
    }
}
