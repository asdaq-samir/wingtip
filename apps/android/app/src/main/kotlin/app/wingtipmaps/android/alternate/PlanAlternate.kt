package app.wingtipmaps.android.alternate

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.Plan
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.Instant

/**
 * The IFR alternate the pilot filed, beside the plan (Plan), as the web
 * keeps it in the address's `alternate`: filed from the Brief's Alternate
 * (AlternateRows), read by the next plan as the nav log's `alternate`, so
 * the leg on to it and its fuel are in the totals (14 CFR 91.167(a)(2),
 * the engine's navlog_alternate_leg), and by the Go / No-Go's ask. Kept
 * apart from Plan so its file stays one job, and across launches, with
 * the destination it was filed for: a new destination drops it, so no
 * flight's fuel counts another's alternate.
 */
object PlanAlternate {
    /** An alternate filed, and the destination it is the alternate of. */
    data class Filed(val dest: String, val ident: String)

    private var prefs: Kept? = null
    private val _filed = MutableStateFlow<Filed?>(null)
    val filed: StateFlow<Filed?> = _filed.asStateFlow()

    /** The one filed last, read once at launch (WingtipApplication). */
    fun attach(context: Context) {
        val kept = Kept.of(context, "alternate").also { prefs = it }
        val dest = kept[DEST]
        val ident = kept[IDENT]
        _filed.value = if (dest != null && ident != null) Filed(dest, ident) else null
    }

    /** `ident` filed as `dest`'s alternate, or null to take it off; the
     *  caller plans again, so the totals carry it. */
    fun file(dest: String, ident: String?) {
        val filed = ident?.trim()?.uppercase()?.ifEmpty { null }?.let { Filed(dest.uppercase(), it) }
        prefs?.edit {
            it.clear()
            if (filed != null) {
                it[DEST] = filed.dest
                it[IDENT] = filed.ident
            }
        }
        _filed.value = filed
    }

    /** The alternate of a plan to `dest` under `rules`: the one filed for
     *  that destination, under IFR only (91.169 is an IFR rule); null
     *  otherwise. */
    fun of(rules: String, dest: String, filed: Filed? = _filed.value): String? =
        filed?.takeIf { rules == "ifr" && it.dest.equals(dest, ignoreCase = true) }?.ident

    /** The nav log's key for it, left out where there is none. */
    fun query(rules: String, dest: String): Map<String, String?> = mapOf("alternate" to of(rules, dest))

    /** When the flight lands at its destination, ISO 8601: the departure
     *  (now where none is set) and the nav log's time en route after it;
     *  null with no time en route (no airplane). The alternate is checked
     *  for it (91.169), and its weather read from it (RouteWorse). */
    fun landsAt(depart: String?, eteMin: Double?, nowMs: Long): String? {
        val ete = eteMin ?: return null
        return Instant.ofEpochMilli((Plan.departMs(depart) ?: nowMs) + Math.round(ete * 60_000)).toString()
    }

    private val DEST = stringPreferencesKey("dest")
    private val IDENT = stringPreferencesKey("ident")
}
