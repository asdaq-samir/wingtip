package app.wingtipmaps.android.share

import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.format.Format

/**
 * The nav log as words to send and as a page to print, the nav log
 * card's Share (the web's nav log Share and Print, the iPhone's Nav Log
 * text and Print): a line a leg -- where to, its cruise altitude (FL-045,
 * decision 0009), its distance, its magnetic heading (its course where no
 * airplane is picked, decision 0011), its time and fuel -- then the
 * totals. Every figure is the planner's, written by Format. Pure, for a
 * unit test.
 */
object NavLogText {
    /** One leg's figures, in the nav log's order. */
    private fun cells(leg: Leg): List<String> = listOf(
        leg.to,
        Format.cruiseAltitude(leg.altitudeFt),
        Format.distance(leg.distanceNm),
        leg.magneticHeadingDeg?.let { "MH " + Format.heading(it) } ?: ("MC " + Format.heading(leg.magneticCourseDeg)),
        leg.eteMin?.let(Format::navLogTime) ?: Format.NONE,
        Format.fuel(leg.fuelGal),
    )

    private fun totals(totals: NavLogTotals?): String? = totals?.let { t ->
        listOfNotNull(
            Format.distance(t.distanceNm),
            t.eteMin?.let(Format::duration),
            t.fuelGal?.let(Format::fuel),
        ).joinToString(" · ")
    }

    /** The nav log as text: the route, a leg a line, the totals. */
    fun text(route: String, legs: List<Leg>, totals: NavLogTotals?): String =
        (listOf(route) + legs.map { cells(it).joinToString("  ") } + listOfNotNull(totals(totals)?.let { "Total  $it" })).joinToString("\n")

    /** The nav log as a page for Android's print framework (a WebView's
     *  print adapter): one table, every cell escaped. */
    fun html(route: String, legs: List<Leg>, totals: NavLogTotals?): String {
        val head = listOf("To", "Altitude", "Dist", "Heading", "ETE", "Fuel")
        fun row(cells: List<String>, tag: String) = "<tr>" + cells.joinToString("") { "<$tag>${escape(it)}</$tag>" } + "</tr>"
        val rows = legs.joinToString("") { row(cells(it), "td") }
        val foot = totals(totals)?.let { "<p>${escape("Total: $it")}</p>" }.orEmpty()
        return "<!doctype html><html><head><meta charset=\"utf-8\"><title>${escape(route)}</title>" +
            "<style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:4px;text-align:left}</style>" +
            "</head><body><h1>${escape(route)}</h1><table>${row(head, "th")}$rows</table>$foot</body></html>"
    }

    private fun escape(text: String): String =
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
}
