package app.wingtipmaps.android.plan

import android.app.Application
import android.content.Context
import androidx.core.content.edit
import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import kotlinx.serialization.Serializable

/**
 * The plan on the page kept for the next launch (Plan's keep and
 * restore), so it opens with no signal: one entry in the "plan"
 * preferences, read back as it was written or not at all.
 */
class KeptPlan(app: Application) {
    /** What is on the page, kept. */
    @Serializable
    class Kept(
        val dep: String,
        val dest: String,
        val stops: List<String>,
        val aircraft: String,
        val course: Course? = null,
        val legs: List<Leg> = emptyList(),
        val totals: NavLogTotals? = null,
        val altitudeFt: Double? = null,
        val depart: String? = null,
        /** When it was planned (epoch ms), for its age with no signal;
         *  none in a plan kept before it was. */
        val plannedAtMs: Long? = null,
    )

    private val prefs = app.getSharedPreferences("plan", Context.MODE_PRIVATE)

    fun write(kept: Kept) = prefs.edit { putString(KEY, Gateway.json.encodeToString(Kept.serializer(), kept)) }

    /** The plan kept, or null where there is none or it no longer reads. */
    fun read(): Kept? = prefs.getString(KEY, null)?.let { runCatching { Gateway.json.decodeFromString(Kept.serializer(), it) }.getOrNull() }

    fun clear() = prefs.edit { remove(KEY) }

    private companion object {
        const val KEY = "kept"
    }
}
