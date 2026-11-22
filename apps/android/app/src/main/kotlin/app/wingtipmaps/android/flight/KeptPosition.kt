package app.wingtipmaps.android.flight

import android.content.Context
import androidx.datastore.preferences.core.longPreferencesKey
import app.wingtipmaps.android.Kept

/** Where the airplane last was, kept across launches so the map opens on
 *  it (the web's useOwnShip lastFix): written at most once a minute, the
 *  position alone. */
class KeptPosition(context: Context) {
    private val kept = Kept.of(context, "own-ship")
    private var keptAtMs = 0L

    /** The last position kept, latitude and longitude; null before the
     *  first fix the phone ever read. */
    val last: Pair<Double, Double>?
        get() = if (KEPT_LAT !in kept) {
            null
        } else {
            Double.fromBits(kept[KEPT_LAT] ?: 0) to Double.fromBits(kept[KEPT_LON] ?: 0)
        }

    /** A fix read: kept where a minute has gone by since the last kept. */
    fun took(fix: OwnShip.Fix) {
        if (fix.atMs - keptAtMs < KEEP_EVERY_MS) return
        keptAtMs = fix.atMs
        kept.edit {
            it[KEPT_LAT] = fix.lat.toRawBits()
            it[KEPT_LON] = fix.lon.toRawBits()
        }
    }

    /** The last position forgotten: signed out, or the account deleted. */
    fun forget() {
        kept.edit { it.clear() }
        keptAtMs = 0L
    }

    companion object {
        /** How often the position is kept for the next launch's map. */
        const val KEEP_EVERY_MS = 60_000L

        /** The last position's latitude and longitude, kept as their bits. */
        private val KEPT_LAT = longPreferencesKey("lat")
        private val KEPT_LON = longPreferencesKey("lon")
    }
}
