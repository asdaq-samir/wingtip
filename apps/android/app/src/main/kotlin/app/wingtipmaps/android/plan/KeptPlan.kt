package app.wingtipmaps.android.plan

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.Serializable
import javax.inject.Inject
import app.wingtipmaps.android.Kept as KeptStore

/**
 * The plan on the page kept for the next launch (Plan's keep and
 * restore), so it opens with no signal: one entry in the "plan" store
 * (KeptStore), read back as it was written or not at all.
 */
class KeptPlan @Inject constructor(@ApplicationContext context: Context) {
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

    private val prefs = KeptStore.of(context, "plan")

    fun write(kept: Kept) = prefs.edit { it[KEY] = Gateway.json.encodeToString(Kept.serializer(), kept) }

    /** The plan kept, or null where there is none or it no longer reads. */
    fun read(): Kept? = prefs[KEY]?.let { runCatching { Gateway.json.decodeFromString(Kept.serializer(), it) }.getOrNull() }

    fun clear() = prefs.edit { it.remove(KEY) }

    private companion object {
        val KEY = stringPreferencesKey("kept")
    }
}
