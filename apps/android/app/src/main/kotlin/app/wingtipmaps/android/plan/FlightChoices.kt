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
 * flown under (FPL's Flight Rules; VFR until changed, as the web's), and
 * whether anyone but the pilot is aboard (the Airplane tab, where the
 * web reads it from the load's seats). The planner plans and briefs by
 * the rules; the copilot reads both (copilot_watch: 61.57(b)'s night
 * passengers, IFR's alternate), and the Brief's forecast icing is
 * IFR's, as the web's.
 */
class FlightChoices(private val prefs: SharedPreferences) {
    private val _rules = MutableStateFlow(FlightRules.of(prefs.getString(RULES, null)))
    val rules: StateFlow<FlightRules> = _rules.asStateFlow()

    private val _passengers = MutableStateFlow(prefs.getBoolean(PASSENGERS, false))
    val passengers: StateFlow<Boolean> = _passengers.asStateFlow()

    fun setRules(rules: FlightRules) {
        prefs.edit { putString(RULES, rules.word) }
        _rules.value = rules
    }

    fun setPassengers(aboard: Boolean) {
        prefs.edit { putBoolean(PASSENGERS, aboard) }
        _passengers.value = aboard
    }

    companion object {
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
