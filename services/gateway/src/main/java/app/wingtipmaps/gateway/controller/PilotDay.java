package app.wingtipmaps.gateway.controller;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.jspecify.annotations.Nullable;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The pilot's own calendar day, which their currency and their paperwork
 * are read on: each app sends its zone's IANA name in {@code X-Time-Zone}
 * (the web's http.ts, the iPhone's and Android's gateway clients). The
 * server's day is UTC's, which turns over at 16:00 in Los Angeles: on the
 * evening of the last day of a pilot's 90 days (14 CFR 61.57(a) and (b),
 * "within the preceding 90 days") they were told they were no longer
 * current, the evening a night flight would need it. Without the header,
 * or with a zone that does not read, the day is UTC's, as it was.
 */
public final class PilotDay {

    /** The header each app sends its zone in, "America/Chicago". */
    public static final String HEADER = "X-Time-Zone";

    private PilotDay() {}

    /** Today in the zone the current request names, else UTC's. */
    public static LocalDate today() {
        return today(Clock.systemUTC());
    }

    static LocalDate today(Clock clock) {
        var attributes = RequestContextHolder.getRequestAttributes();
        String named = attributes instanceof ServletRequestAttributes servlet
                ? servlet.getRequest().getHeader(HEADER)
                : null;
        return LocalDate.now(clock.withZone(zoneOf(named)));
    }

    /** A zone's IANA name as a zone; UTC for none or one that does not read. */
    static ZoneId zoneOf(@Nullable String named) {
        if (named == null || named.isBlank()) {
            return ZoneOffset.UTC;
        }
        try {
            return ZoneId.of(named.trim());
        } catch (DateTimeException e) {
            return ZoneOffset.UTC;
        }
    }
}
