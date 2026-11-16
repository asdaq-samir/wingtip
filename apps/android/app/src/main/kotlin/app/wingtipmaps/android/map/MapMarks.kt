package app.wingtipmaps.android.map

import android.content.Context
import app.wingtipmaps.android.api.AirportPin
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.reportingInView
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.engine.airportsInView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The fields the chart shows, for a pilot who cannot see it: the map
 * draws its fields from vector tiles that TalkBack cannot read, so with a
 * screen reader on the map asks for the fields in its view (the cycle
 * packs kept on the phone first, the planner's reporting fields second,
 * as InView.kt's callers do) and offers each as an action on the map
 * that opens its card, the same card a tap on its symbol opens.
 */
object MapMarks {
    /** More than this many actions is a list nobody will go through by
     *  ear; the packs give the biggest fields first. */
    const val MOST = 25

    /** The fields in view, biggest first, at most MOST; none where neither
     *  the packs nor the planner could say. */
    suspend fun fieldsInView(context: Context, view: MapRest): List<AirportPin> = withContext(Dispatchers.IO) {
        val packs = runCatching { CyclePacks.of(context).airportsInView(view.south, view.west, view.north, view.east) }.getOrNull()
        val fields = packs ?: try {
            Planner.reportingInView(view.south, view.west, view.north, view.east)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emptyList()
        }
        // In the chart's own order: the engine's field_mark_rank, which the
        // packs' and the planner's answers carry as mark_order (a Class B's
        // field first), the list's order kept where an older one has none.
        fields.sortedBy { it.markOrder ?: Int.MAX_VALUE }.take(MOST)
    }

    /** What an action on the map says for a field: "KDLH, Duluth
     *  International", and its weather where it reports (StationMarks.said):
     *  "KJVL, Southern Wisconsin Regional, IFR, wind 220 at 18 gusting 26". */
    fun label(pin: AirportPin, weather: FieldWx? = null): String =
        listOf(pin.ident, pin.name, weather?.let(StationMarks::said).orEmpty()).filter { it.isNotEmpty() }.joinToString(", ")
}
