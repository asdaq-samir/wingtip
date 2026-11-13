package app.wingtipmaps.android.plan

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** VFR or IFR, as the planner's `rules` takes it (the web's FlightRules). */
enum class FlightRules(val word: String) {
    VFR("vfr"), IFR("ifr");

    companion object {
        fun of(word: String?): FlightRules = entries.firstOrNull { it.word == word } ?: VFR
    }
}

/**
 * What the pilot says of the flight that no route shows, kept across
 * launches as the web's preferences keep them: the flight rules it is
 * flown under (the plan's Flight Rules; VFR until changed, as the web's), and
 * whether anyone but the pilot is aboard (the Airplane page, where the
 * web reads it from the load's seats), and the airplane's registration
 * (the Airplane page, where the web picks the pilot's own). The planner plans and briefs by
 * the rules; the copilot reads both (copilot_watch: 61.57(b)'s night
 * passengers, IFR's alternate), and the Brief's forecast icing is
 * IFR's, as the web's.
 */
class FlightChoices(private val prefs: Kept) {
    private val _rules = MutableStateFlow(FlightRules.of(prefs[RULES]))
    val rules: StateFlow<FlightRules> = _rules.asStateFlow()

    private val _passengers = MutableStateFlow(prefs[PASSENGERS] ?: false)
    val passengers: StateFlow<Boolean> = _passengers.asStateFlow()

    /** The airplane's registration, the call sign ATC uses for it (AIM
     *  4-2-4): what the ATC copilot listens for and the logbook's
     *  airplane. None until the pilot gives it: none is assumed. */
    private val _tail = MutableStateFlow(prefs[TAIL])
    val tail: StateFlow<String?> = _tail.asStateFlow()

    /** The pilot's home airport on this phone, set in Setup and taken
     *  from the account's home base at sign-in (HomeAirport): where a
     *  route starts when the pilot names only where to (StripModel.route,
     *  the first flight's Plan It). None until given. */
    private val _home = MutableStateFlow(prefs[HOME])
    val home: StateFlow<String?> = _home.asStateFlow()

    fun setHome(ident: String?) {
        val home = ident?.trim()?.uppercase()?.ifEmpty { null }
        prefs.edit { if (home == null) it.remove(HOME) else it.set(HOME, home) }
        _home.value = home
    }

    fun setTail(registration: String) {
        val tail = registration.trim().uppercase().ifEmpty { null }
        prefs.edit { if (tail == null) it.remove(TAIL) else it.set(TAIL, tail) }
        _tail.value = tail
    }

    fun setRules(rules: FlightRules) {
        prefs.edit { it[RULES] = rules.word }
        _rules.value = rules
    }

    fun setPassengers(aboard: Boolean) {
        prefs.edit { it[PASSENGERS] = aboard }
        _passengers.value = aboard
    }

    companion object {
        private val TAIL = stringPreferencesKey("tail")
        private val HOME = stringPreferencesKey("home")
        private val RULES = stringPreferencesKey("rules")
        private val PASSENGERS = booleanPreferencesKey("passengers")

        @Volatile
        private var shared: FlightChoices? = null

        fun of(context: Context): FlightChoices =
            shared ?: synchronized(this) {
                shared ?: FlightChoices(Kept.of(context, "flight")).also { shared = it }
            }
    }
}
