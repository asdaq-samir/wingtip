package app.wingtipmaps.android.pilot

import android.content.Context
import androidx.datastore.preferences.core.floatPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The pilot's personal minimums (the web's lib/minimums): the weather
 * they have decided they will not take off or land in, stricter than the
 * rules, each off (null) until picked. Not a rule of their own: the
 * engine reads them (copilot_watch's minimums, rvr_check's visibility),
 * and says where the weather is under them.
 */
data class Minimums(
    /** The lowest ceiling, feet above the field (a METAR's or TAF's). */
    val ceilingFt: Double? = null,
    /** The least visibility, statute miles. */
    val visibilitySm: Double? = null,
    /** The most crosswind on the best runway, gusts included, knots. */
    val crosswindKt: Double? = null,
    /** The most surface wind, gusts included, knots. */
    val windKt: Double? = null,
) {
    /** As the copilot's question takes them. */
    val forCopilot: EngineContract.CopilotWatchInputMinimums
        get() = EngineContract.CopilotWatchInputMinimums(ceilingFt, visibilitySm, crosswindKt, windKt)

    enum class Kind { CEILING, VISIBILITY, CROSSWIND, WIND }

    operator fun get(kind: Kind): Double? = when (kind) {
        Kind.CEILING -> ceilingFt
        Kind.VISIBILITY -> visibilitySm
        Kind.CROSSWIND -> crosswindKt
        Kind.WIND -> windKt
    }

    fun with(kind: Kind, value: Double?): Minimums = when (kind) {
        Kind.CEILING -> copy(ceilingFt = value)
        Kind.VISIBILITY -> copy(visibilitySm = value)
        Kind.CROSSWIND -> copy(crosswindKt = value)
        Kind.WIND -> copy(windKt = value)
    }

    companion object {
        /** The choices each is picked from, the web's MINIMUM_CHOICES (a
         *  menu, not a slider: decision 0017). They are the pilot's own
         *  limits, not a rule's, so the same steps as the web's and no
         *  more; the legal minimums stay the engine's (14 CFR 91.155). */
        val CHOICES: Map<Kind, List<Double>> = mapOf(
            Kind.CEILING to listOf(1000.0, 1500.0, 2000.0, 2500.0, 3000.0, 4000.0, 5000.0),
            Kind.VISIBILITY to listOf(3.0, 4.0, 5.0, 6.0, 8.0, 10.0),
            Kind.CROSSWIND to listOf(5.0, 8.0, 10.0, 12.0, 15.0, 17.0, 20.0),
            Kind.WIND to listOf(10.0, 15.0, 20.0, 25.0, 30.0, 35.0),
        )
    }
}

/** The minimums kept on this phone, so they need no sign-in, as the
 *  web keeps them in the browser. */
class MinimumsStore(private val prefs: Kept) {
    private val _minimums = MutableStateFlow(read())
    val minimums: StateFlow<Minimums> = _minimums.asStateFlow()

    fun set(kind: Minimums.Kind, value: Double?) {
        prefs.edit { if (value == null) it.remove(key(kind)) else it.set(key(kind), value.toFloat()) }
        _minimums.value = _minimums.value.with(kind, value)
    }

    /** The pilot's minimums gone: signed out, or the account deleted. */
    fun forget() {
        prefs.edit { it.clear() }
        _minimums.value = Minimums()
    }

    private fun read(): Minimums = Minimums.Kind.entries.fold(Minimums()) { m, kind ->
        m.with(kind, prefs[key(kind)]?.toDouble())
    }

    companion object {
        /** Each minimum under its kind's name, a float, as it was kept. */
        private fun key(kind: Minimums.Kind) = floatPreferencesKey(kind.name)

        @Volatile
        private var shared: MinimumsStore? = null

        fun of(context: Context): MinimumsStore =
            shared ?: synchronized(this) {
                shared ?: MinimumsStore(Kept.of(context, "minimums")).also { shared = it }
            }
    }
}
