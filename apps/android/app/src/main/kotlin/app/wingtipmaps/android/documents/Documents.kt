package app.wingtipmaps.android.documents

import android.content.Context
import android.net.Uri
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.ai.read.OnPhoneReader
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.documents.model.DocumentRead
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import java.time.LocalDate

/**
 * A photographed page read on the phone (OnPhoneReader: ML Kit's text
 * recognizer and Gemini Nano, checked by the engine here), answered with
 * what was read and the engine's check of it. Nothing is saved by the
 * read; the screens show every item for the pilot to confirm, and save
 * only what was confirmed. No photo leaves the phone: the server's reader
 * was Claude's and was taken out (decision 0041).
 */
object Documents {
    /** What the page is of, as the read names it (DocumentRead.kind). */
    enum class Kind(val wire: String) {
        PERFORMANCE("poh-performance"),
        WEIGHT_BALANCE("weight-balance"),
        LOGBOOK("logbook-page"),
        CLEARANCE("clearance"),
    }

    /** The answer decoded. The engine writes every number as a float, so
     *  a count (a logbook row's landings) may come as 1.0, which the
     *  decoder will not take for an Int: whole numbers are made integers
     *  first, which a Double field takes as well. */
    fun decode(body: String): DocumentRead =
        Gateway.json.decodeFromJsonElement(wholeNumbers(Gateway.json.parseToJsonElement(body)))

    fun wholeNumbers(e: JsonElement): JsonElement = when (e) {
        is JsonObject -> JsonObject(e.mapValues { wholeNumbers(it.value) })
        is JsonArray -> JsonArray(e.map(::wholeNumbers))
        is JsonPrimitive -> {
            val d = if (e.isString) null else e.content.toDoubleOrNull()
            if (d != null && d == Math.rint(d) && kotlin.math.abs(d) < 1e15 && e.content.any { it == '.' || it == 'e' || it == 'E' }) JsonPrimitive(d.toLong()) else e
        }
    }

    /** The page read on this phone, or [Unread] where it could not be. */
    suspend fun read(context: Context, page: Uri, kind: Kind, today: LocalDate = AppClock.today()): DocumentRead =
        OnPhoneReader.read(context, page, kind, today) ?: throw Unread()

    /** The phone could not read the page: no Gemini Nano here, no text on
     *  the photo, or a read that did not decode. */
    class Unread : Exception("This page could not be read on this phone. Try a sharper, flatter photo.")

    /** Why a read failed, said where the page was asked for. */
    fun words(e: Exception): String = e.message ?: "The page could not be read."
}
