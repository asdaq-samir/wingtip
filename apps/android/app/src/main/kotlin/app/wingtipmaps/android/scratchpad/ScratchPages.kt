package app.wingtipmaps.android.scratchpad

import androidx.annotation.StringRes
import app.wingtipmaps.android.R
import kotlinx.serialization.Serializable

/**
 * A scratchpad page's kind (the market-gap report's item 5, ForeFlight's
 * and Garmin Pilot's templates): a blank page, or one with the fields a
 * pilot copies -- each a stock text field, so a hardware keyboard, the
 * on-screen one and a stylus's handwriting (Android's own stylus writing
 * into a text field) all fill it -- over the ink area below.
 *
 * - CRAFT: a clearance in the order pilots copy it, the items of AIM
 *   4-4-3 (Clearance limit, Route of flight, Altitude data, Frequency and
 *   beacon code).
 * - ATIS: the broadcast's letter and the items a pilot reads back or
 *   sets, from AIM 4-1-13's list: wind, altimeter, the runway in use and
 *   the remarks.
 * - Takeoff and landing: the runway, the wind, the temperature and the
 *   altimeter the figures are worked out in, and the two distances, from
 *   the airplane's handbook (the Brief's runway check is the engine's).
 */
@Serializable
enum class Template(@StringRes val title: Int, val fields: List<Field>) {
    BLANK(R.string.scratchpad_blank, emptyList()),
    CRAFT(
        R.string.scratchpad_craft,
        listOf(Field("clearance_limit", R.string.field_clearance_limit), Field("route", R.string.field_route), Field("altitude", R.string.field_altitude), Field("frequency", R.string.field_frequency), Field("transponder", R.string.field_transponder)),
    ),
    ATIS(
        R.string.scratchpad_atis,
        listOf(Field("information", R.string.field_information), Field("wind", R.string.field_wind), Field("altimeter", R.string.field_altimeter), Field("runway", R.string.field_runway), Field("remarks", R.string.field_remarks)),
    ),
    TOLD(
        R.string.scratchpad_told,
        listOf(
            Field("runway", R.string.field_runway), Field("wind", R.string.field_wind), Field("temperature", R.string.field_temperature),
            Field("altimeter", R.string.field_altimeter), Field("takeoff_distance", R.string.field_takeoff_distance), Field("landing_distance", R.string.field_landing_distance),
        ),
    ),
}

/** A template's field: its key in the page's fields and its label. */
data class Field(val key: String, @StringRes val label: Int)

/** One stroke kept: its pen's size in the page's pixels and its inputs as
 *  Jetpack Ink's storage encodes them (StrokeInputBatch.encode), in
 *  Base64. Drawn in the page's ink colour, so dark and light both read. */
@Serializable
data class InkLine(val size: Float, val inputs: String)

/** A page: its kind, what is typed in its fields, its ink, when made. */
@Serializable
data class ScratchPage(
    val id: String,
    val template: Template,
    val madeMs: Long,
    val fields: Map<String, String> = emptyMap(),
    val ink: List<InkLine> = emptyList(),
)

/** A flight's pages, oldest first: what is kept on the phone. */
@Serializable
data class ScratchBook(val pages: List<ScratchPage> = emptyList()) {
    fun add(page: ScratchPage) = copy(pages = pages + page)

    fun remove(id: String) = copy(pages = pages.filterNot { it.id == id })

    fun change(id: String, how: (ScratchPage) -> ScratchPage) = copy(pages = pages.map { if (it.id == id) how(it) else it })

    fun field(id: String, key: String, text: String) = change(id) { it.copy(fields = it.fields + (key to text)) }

    fun write(id: String, lines: List<InkLine>) = change(id) { it.copy(ink = it.ink + lines) }

    /** The last stroke taken back. */
    fun undo(id: String) = change(id) { it.copy(ink = it.ink.dropLast(1)) }

    fun clearInk(id: String) = change(id) { it.copy(ink = emptyList()) }
}
