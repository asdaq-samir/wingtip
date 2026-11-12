package app.wingtipmaps.android.plan

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
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
class FlightChoices(private val prefs: SharedPreferences) {
    private val _rules = MutableStateFlow(FlightRules.of(prefs.getString(RULES, null)))
    val rules: StateFlow<FlightRules> = _rules.asStateFlow()

    private val _passengers = MutableStateFlow(prefs.getBoolean(PASSENGERS, false))
    val passengers: StateFlow<Boolean> = _passengers.asStateFlow()

    /** The airplane's registration, the call sign ATC uses for it (AIM
     *  4-2-4): what the ATC copilot listens for and the logbook's
     *  airplane. None until the pilot gives it: none is assumed. */
    private val _tail = MutableStateFlow(prefs.getString(TAIL, null))
    val tail: StateFlow<String?> = _tail.asStateFlow()

    /** The pilot's home airport on this phone, set in Setup and taken
     *  from the account's home base at sign-in (HomeAirport): where a
     *  route starts when the pilot names only where to (StripModel.route,
     *  the first flight's Plan It). None until given. */
    private val _home = MutableStateFlow(prefs.getString(HOME, null))
    val home: StateFlow<String?> = _home.asStateFlow()

    fun setHome(ident: String?) {
        val home = ident?.trim()?.uppercase()?.ifEmpty { null }
        prefs.edit { if (home == null) remove(HOME) else putString(HOME, home) }
        _home.value = home
    }

    fun setTail(registration: String) {
        val tail = registration.trim().uppercase().ifEmpty { null }
        prefs.edit { if (tail == null) remove(TAIL) else putString(TAIL, tail) }
        _tail.value = tail
    }

    fun setRules(rules: FlightRules) {
        prefs.edit { putString(RULES, rules.word) }
        _rules.value = rules
    }

    fun setPassengers(aboard: Boolean) {
        prefs.edit { putBoolean(PASSENGERS, aboard) }
        _passengers.value = aboard
    }

    companion object {
        private const val TAIL = "tail"
        private const val HOME = "home"
        private const val RULES = "rules"
        private const val PASSENGERS = "passengers"

        @Volatile
        private var shared: FlightChoices? = null

        fun of(context: Context): FlightChoices =
            shared ?: synchronized(this) {
                shared ?: FlightChoices(context.applicationContext.getSharedPreferences("flight", Context.MODE_PRIVATE)).also { shared = it }
            }
    }
}
