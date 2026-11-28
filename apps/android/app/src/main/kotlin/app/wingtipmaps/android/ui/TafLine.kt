package app.wingtipmaps.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.words
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A field's TAF's own times under it, and whether it speaks for now, as
 * the web's airport card says them:
 * "TAF issued 11 1130Z, valid to 12 1200Z", and once its period has ended
 * "TAF expired 12 1200Z: no forecast in force" in the caution ink, so a
 * TAF kept from before the signal was lost is never read as today's
 * forecast (14 CFR 91.103). The rule is the engine's taf_validity
 * (FAA-H-8083-28B 27.4.1), asked with the card's words (AirportReads);
 * only the writing is here.
 */
@Composable
fun TafLine(taf: Pair<String, Boolean>, modifier: Modifier = Modifier) {
    val (line, caution) = taf
    Text(
        line,
        modifier,
        style = MaterialTheme.typography.bodyMedium,
        color = if (caution) LocalInk.current.words(Finding.CAUTION, MaterialTheme.colorScheme.onSurfaceVariant) else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/** The TAF line's words, the web's tafLine. */
object TafWords {
    private val DAY_ZULU = DateTimeFormatter.ofPattern("d HHmm'Z'", Locale.US).withZone(ZoneOffset.UTC)

    /** A TAF time as its header writes one, the UTC day and the time: "12 1200Z". */
    fun dayZulu(s: Double): String = DAY_ZULU.format(Instant.ofEpochSecond(s.toLong()))

    /** The line, and whether it is said in the caution ink. */
    fun line(v: EngineContract.TafValidityAnswer): Pair<String, Boolean> = when (v.state) {
        "expired" -> "TAF expired ${dayZulu(v.validTo)}: no forecast in force" to true
        "not_yet" -> "TAF issued ${dayZulu(v.issued)}, valid from ${dayZulu(v.validFrom)}" to false
        else -> "TAF issued ${dayZulu(v.issued)}, valid to ${dayZulu(v.validTo)}" to false
    }
}
