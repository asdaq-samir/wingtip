package app.wingtipmaps.android.documents

import android.content.Context
import android.net.Uri
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.ai.ClaudeGate
import app.wingtipmaps.android.ai.read.OnPhoneReader
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.assistant.DocumentRead
import app.wingtipmaps.android.api.generated.assistant.ReadAsk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import java.io.IOException
import java.time.LocalDate
import java.util.Base64

/**
 * A photographed page read on the phone where it can be (OnPhoneReader),
 * else by the assistant (POST /api/read-document,
 * through the gateway's proxy as the assistant's other calls go): the
 * photo and what it is of, answered with what was read and the engine's
 * check of it. Nothing is saved by the read; the screens show every item
 * for the pilot to confirm, and save only what was confirmed.
 */
object Documents {
    /** What the page is of, in the server's words (ReadAsk.kind). */
    enum class Kind(val wire: String) {
        PERFORMANCE("poh-performance"),
        WEIGHT_BALANCE("weight-balance"),
        LOGBOOK("logbook-page"),
        CLEARANCE("clearance"),
    }

    /** The ask: the JPEG's bytes in base64 with no line breaks, and the
     *  phone's own date, which a logbook row may not be after. */
    fun ask(kind: Kind, jpeg: ByteArray, today: LocalDate): ReadAsk =
        ReadAsk(image = Base64.getEncoder().encodeToString(jpeg), kind = kind.wire, mediaType = "image/jpeg", today = today.toString())

    fun body(ask: ReadAsk): String = Gateway.json.encodeToString(ask)

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

    /** The page read: the photo made a JPEG off the main thread, then
     *  posted with the pilot's session and the CSRF header. */
    suspend fun read(context: Context, page: Uri, kind: Kind, today: LocalDate = AppClock.today()): DocumentRead {
        // On the phone first: ML Kit's text recognizer and Gemini Nano,
        // checked by the engine here (OnPhoneReader); the photo goes to the
        // server only where this phone cannot read it (docs/android-ai.md).
        OnPhoneReader.read(context, page, kind, today)?.let { return it }
        // The server's reader is Claude's: not asked while the Claude
        // features are off (ClaudeGate, the owner's decision of 2026-11-10).
        ClaudeGate.require()
        val jpeg = withContext(Dispatchers.IO) { PagePhoto.jpeg(context, page) }
        val (body, status) = Gateway.call("POST", Config.plannerPath("/api/read-document"), json = body(ask(kind, jpeg, today)))
        if (status != 200) throw Planner.Failure(status, Planner.detail(body))
        return decode(body)
    }

    /** Why a read failed, said where the page was asked for: the
     *  server's own words where it sent any. */
    fun words(e: Exception): String = when {
        e is ClaudeGate.Off -> e.message.orEmpty()
        e is Planner.Failure && e.status == 503 -> e.detail ?: "The page reader can't be reached right now. Try again in a minute."
        e is Planner.Failure && e.status == 502 -> e.detail ?: "The figures read could not be checked."
        e is Planner.Failure && e.status == 413 -> "The photo is too large to send."
        e is Planner.Failure && e.status == 422 -> e.detail ?: "The photo could not be read as a picture."
        e is Planner.Failure && (e.status == 401 || e.status == 403) -> "Sign in to read a page."
        e is Planner.Failure && e.status == 404 -> "Reading a page isn't on this server yet."
        e is Planner.Failure -> e.message ?: "The server answered ${e.status}."
        e is IOException -> Problems.say("The page reader could not be reached", e)
        else -> e.message ?: "The page could not be read."
    }
}
