package app.wingtipmaps.android.ui

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The NOTAM list's coverage, said wherever NOTAMs are listed (the airport
 * card's, and Ready to fly's NOTAMs item, whose line is the engine's), as
 * the web's lib/notamCoverage says it: until the planner holds the FAA's
 * full set (NMS-API's load, decision 0059, amending 0023) it holds only
 * what the FAA's feed has sent since the day it was first heard, so every
 * list says from when, that it is not the full set, and never that there
 * are no NOTAMs. The words are the resources' (notams_*); the days here.
 */
object NotamCoverage {
    private val DAY_YEAR = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)
    private val DAY = DateTimeFormatter.ofPattern("d MMM", Locale.US)

    /** The day of an ISO date or time ("2026-10-19", "2026-10-19T06:00:00Z"). */
    fun day(since: String?): LocalDate? =
        since?.takeIf { it.length >= 10 }?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

    /** "19 Oct 2026", as the line under the list writes it. */
    fun withYear(since: String?): String? = day(since)?.format(DAY_YEAR)

    /** "19 Oct", as an empty list writes it. */
    fun short(since: String?): String? = day(since)?.format(DAY)
}
