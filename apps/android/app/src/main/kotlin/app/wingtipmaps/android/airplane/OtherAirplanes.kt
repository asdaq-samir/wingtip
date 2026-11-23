package app.wingtipmaps.android.airplane

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Extra
import app.wingtipmaps.android.Extras
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.rememberExtra

/**
 * Whether an airplane's Follow, past flights and replay, NTSB cases,
 * ownership history, documents and usual base are offered: always for the
 * pilot's own (its record kept, or the N-number flown), for any other only
 * while Settings' Extras has Other Airplanes on (the feature review,
 * 2026-11-21: a private airplane's flights and home field are a person's
 * movements; the web's useAirplaneHistory).
 */
object OtherAirplanes {
    /** Whether `tail` is one of the pilot's own, by its N-number. */
    fun isOwn(tail: String?, records: Map<String, OwnRecord>, flown: String?): Boolean {
        val t = tail?.trim()?.uppercase()?.ifEmpty { null } ?: return false
        return records.containsKey(OwnRecord.key(t, "")) || t == flown?.trim()?.uppercase()
    }

    /** As offered now, for code that is not drawing (Tracking's watches). */
    fun historyOffered(context: Context, tail: String?): Boolean =
        Extras.of(context).isOn(Extra.OTHER_AIRPLANES) ||
            isOwn(tail, OwnAirplanes.of(context).records.value, FlightChoices.of(context).tail.value)
}

/** [OtherAirplanes.historyOffered] for a screen, as the switch, the
 *  pilot's records and the N-number flown change. */
@Composable
fun rememberHistoryOffered(tail: String?): Boolean {
    val context = LocalContext.current
    val others = rememberExtra(Extra.OTHER_AIRPLANES)
    val records by remember(context) { OwnAirplanes.of(context) }.records.collectAsStateWithLifecycle()
    val flown by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    return others || OtherAirplanes.isOwn(tail, records, flown)
}
