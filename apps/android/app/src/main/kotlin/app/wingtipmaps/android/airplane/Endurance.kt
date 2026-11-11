package app.wingtipmaps.android.airplane

import androidx.annotation.StringRes
import app.wingtipmaps.android.R
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.endurance

/** The engine's endurance rule (engine/crates/procedures figures/endurance), a fake in the tests. */
fun interface EnduranceRule {
    fun endurance(usableGal: Double?, burnGph: Double?, reserve: String): Result<EngineContract.EnduranceAnswer>
}

object EngineEndurance : EnduranceRule {
    override fun endurance(usableGal: Double?, burnGph: Double?, reserve: String) = Engine.endurance(usableGal, burnGph, reserve)
}

/**
 * An airplane's endurance as its profile shows it: how long its usable
 * fuel lasts at its cruise burn, then what is left once each reserve is
 * kept back -- 30 minutes by day and 45 at night under VFR (14 CFR
 * 91.151(a)(1), (a)(2)), 45 under IFR (91.167(a)(3)) -- every figure the
 * engine's `endurance`. Null without the airplane's own usable fuel and
 * burn: none is assumed (decision 0011). Tanks holding less than a
 * reserve are flagged (`below`), never refused.
 */
data class Endurance(val minutes: Double, val after: List<AfterReserve>) {
    /** The minutes left after `reserve` is kept, its own minutes, and
     *  whether the tanks hold less than it. */
    data class AfterReserve(val reserve: Reserve, val minutes: Double, val reserveMin: Double, val below: Boolean)

    /** The reserves, by the engine's names, with the row's words. */
    enum class Reserve(val key: String, @StringRes val title: Int) {
        VFR_DAY("vfr_day", R.string.endurance_vfr_day),
        VFR_NIGHT("vfr_night", R.string.endurance_vfr_night),
        IFR("ifr", R.string.endurance_ifr),
    }

    companion object {
        fun of(airplane: AirplaneNow, rule: EnduranceRule = EngineEndurance): Endurance? {
            val usable = airplane.value(FigureKey.USABLE)
            val burn = airplane.value(FigureKey.BURN)
            val answers = Reserve.entries.associateWith { rule.endurance(usable, burn, it.key).getOrNull() }
            val minutes = answers.values.firstNotNullOfOrNull { it?.minutes } ?: return null
            val after = answers.mapNotNull { (reserve, a) -> a?.afterReserveMin?.let { AfterReserve(reserve, it, a.reserveMin, a.belowReserve) } }
            return Endurance(minutes, after)
        }
    }
}
