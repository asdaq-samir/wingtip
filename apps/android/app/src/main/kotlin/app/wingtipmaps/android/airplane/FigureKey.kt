package app.wingtipmaps.android.airplane

import androidx.annotation.StringRes
import app.wingtipmaps.android.R
import java.util.Locale

/**
 * Every airplane figure a pilot may set, by the engine's airplane_figures
 * key (the gateway record's and the planner's query's name in snake case),
 * with where the gateway keeps it -- on the record itself (`top`) or in
 * its own handbook figures (OwnFigures) -- whether the planner takes it as
 * an override, the engine's handbook page's name for it where a
 * photographed page carries it, and its words. Each figure is the
 * airplane's handbook's: cruise and burn its Section 5 cruise table,
 * climb its Section 5 climb chart, the descent its Section 5 descent
 * figures (an indicated speed, as a handbook gives it), the service ceiling where its best
 * climb falls to 100 fpm (FAA-H-8083-25C ch. 11), start and taxi fuel its
 * Section 5 note, the glide ratio its Section 3 "Maximum glide", the empty
 * weight and moment its own weight and balance record (FAA-H-8083-1B).
 */
enum class FigureKey(
    val key: String,
    val top: Boolean,
    val planner: Boolean,
    val handbookName: String?,
    @StringRes val label: Int,
    @StringRes val question: Int,
    val unit: String,
) {
    CRUISE("cruise_tas_kt", true, true, "cruiseTasKt", R.string.own_cruise, R.string.ask_cruise, "kt"),
    BURN("fuel_burn_gph", true, true, "fuelBurnGph", R.string.own_burn, R.string.ask_burn, "gph"),
    POWER("cruise_power_pct", true, true, "cruisePowerPct", R.string.own_power, R.string.ask_power, "%"),
    USABLE("usable_fuel_gal", true, true, "usableFuelGal", R.string.own_usable, R.string.ask_usable, "gal"),
    CLIMB_TAS("climb_tas_kt", true, true, null, R.string.own_climb_tas, R.string.ask_climb_tas, "kt"),
    CLIMB_BURN("climb_fuel_burn_gph", true, true, null, R.string.own_climb_burn, R.string.ask_climb_burn, "gph"),
    DESCENT_IAS("descent_ias_kt", true, true, null, R.string.own_descent_ias, R.string.ask_descent_ias, "kt"),
    DESCENT_BURN("descent_fuel_burn_gph", true, true, null, R.string.own_descent_burn, R.string.ask_descent_burn, "gph"),
    CLIMB_RATE("climb_rate_fpm", false, true, null, R.string.own_climb_rate, R.string.ask_climb_rate, "fpm"),
    CEILING("service_ceiling_ft", false, true, null, R.string.own_ceiling, R.string.ask_ceiling, "ft"),
    TAXI("taxi_fuel_gal", false, true, null, R.string.own_taxi, R.string.ask_taxi, "gal"),
    GLIDE("glide_ratio", false, true, null, R.string.own_glide, R.string.ask_glide, "to 1"),
    EMPTY_WEIGHT("empty_weight_lb", false, false, null, R.string.own_empty_weight, R.string.ask_empty_weight, "lb"),
    EMPTY_MOMENT("empty_moment_lb_in", false, false, null, R.string.own_empty_moment, R.string.ask_empty_moment, "lb-in"),
    ;

    /** "112 kt", "8.5 gph", "65%", "9 to 1": whole where whole, else to a tenth. */
    fun show(value: Double): String {
        val n = if (value % 1.0 == 0.0) String.format(Locale.US, "%,d", value.toLong()) else String.format(Locale.US, "%,.1f", value)
        return if (unit == "%") "$n%" else "$n $unit"
    }

    companion object {
        fun of(key: String): FigureKey? = entries.firstOrNull { it.key == key }

        /** A figure as typed: a number, "8,5" read as 8.5, nothing for
         *  none. None below zero, and only start and taxi fuel may be none
         *  at all; every other figure is a speed, rate, height or amount an
         *  airplane has more than nothing of. Whether it is a likely one is
         *  the gateway's to say (its own limits), never refused here. */
        fun parse(key: FigureKey, text: String): Double? {
            val v = text.trim().replace(',', '.').toDoubleOrNull() ?: return null
            if (v.isNaN() || v.isInfinite() || v < 0) return null
            return if (v == 0.0 && key != TAXI) null else v
        }
    }
}
