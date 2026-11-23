package app.wingtipmaps.android.balance

import androidx.lifecycle.ViewModel
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.airplane.FigureKey
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.fuelGrades
import app.wingtipmaps.android.engine.generated.gonogoBalance
import app.wingtipmaps.android.engine.generated.gonogoDefaultLoad
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

/**
 * The weight and balance screen's model (BalancePage; the market-gap
 * report's item 8, the web's Brief Loading page): the airplane's loading
 * from its profile (the book's or the pilot's handbook page's: limits,
 * stations, fuel and the CG envelope), what the pilot puts aboard each
 * station and in the tanks, and the engine's gonogo_balance of it at
 * takeoff and landing against 14 CFR 91.9(a)'s limits -- every figure the
 * engine's, none worked out here. The empty airplane is the pilot's own
 * record of it where given (its weight and moment, FAA-H-8083-1B), its arm
 * the engine's (gonogo_default_load over that weight and moment), else
 * the profile's sample. No airplane picked, nothing is loaded: none is
 * assumed (decision 0011).
 */
@HiltViewModel
class BalanceModel @Inject constructor() : ViewModel() {
    data class State(
        /** The airplane's loading; null with no airplane or none in its profile. */
        val loading: EngineContract.GonogoLoading? = null,
        /** The empty airplane, and whether it is the pilot's own record. */
        val emptyWeightLb: Double = 0.0,
        val emptyArmIn: Double = 0.0,
        val emptyOwn: Boolean = false,
        /** Each station's pounds as typed, in the loading's order; and the
         *  fuel at the start, gallons. */
        val stations: List<String> = emptyList(),
        val fuel: String = "",
        /** The fuel's grades and their weights (the engine's fuel_grades,
         *  FAA-H-8083-1B), and the one picked; null, the POH's own figure.
         *  Which wins is the engine's (gonogo_balance): the grade picked,
         *  then the POH's, as on the web and the iPhone. */
        val grades: List<EngineContract.FuelGradesAnswerItem> = emptyList(),
        val grade: String? = null,
        val balance: EngineContract.GonogoBalanceAnswer? = null,
        val problem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var airplane: AirplaneNow? = null
    private var tripFuelGal: Double? = null

    /** The airplane flown and the trip's fuel (the nav log's burn): its
     *  loading read again where the airplane changed, the load kept. */
    fun asked(now: AirplaneNow, tripFuelGal: Double?) {
        this.tripFuelGal = tripFuelGal
        if (now != airplane) {
            airplane = now
            _state.value = start(now)
        }
        work()
    }

    fun setStation(index: Int, text: String) {
        _state.update { s -> s.copy(stations = s.stations.mapIndexed { i, t -> if (i == index) text else t }) }
        work()
    }

    fun setGrade(grade: String?) {
        _state.update { it.copy(grade = grade) }
        work()
    }

    fun setFuel(text: String) {
        _state.update { it.copy(fuel = text) }
        work()
    }

    /** The engine's balance of the load as it stands. */
    private fun work() {
        val s = _state.value
        val loading = s.loading ?: return
        val answer = Engine.gonogoBalance(loading, loadOf(s), tripFuelGal)
        _state.update { it.copy(balance = answer.getOrNull(), problem = answer.exceptionOrNull()?.message) }
    }

    companion object {
        /** What is aboard as the engine reads it, with the grade picked:
         *  the fuel's weight a gallon is the engine's to choose. */
        fun loadOf(s: State): EngineContract.GonogoLoad = EngineContract.GonogoLoad(
            emptyWeightLb = s.emptyWeightLb, emptyArmIn = s.emptyArmIn,
            stationsLb = s.stations.map(::pounds), fuelGal = pounds(s.fuel) ?: 0.0, fuelGrade = s.grade,
        )

        /** The screen as an airplane opens it: its loading, its empty
         *  weight and arm, every station empty and the tanks full -- the
         *  pilot types what is aboard. */
        fun start(now: AirplaneNow): State {
            val loading = loadingOf(now) ?: return State()
            val weight = now.value(FigureKey.EMPTY_WEIGHT)
            val moment = now.value(FigureKey.EMPTY_MOMENT)
            val own = weight != null && moment != null && weight > 0
            val asked = if (own) loading.copy(sampleEmptyWeightLb = weight, sampleEmptyMomentLbIn = moment) else loading
            val empty = Engine.gonogoDefaultLoad(asked, loading.fuelMaxGal)
            val d = empty.getOrNull() ?: return State(loading = loading, problem = empty.exceptionOrNull()?.message)
            val grades = Engine.fuelGrades().getOrDefault(emptyList())
            return State(
                loading = loading, emptyWeightLb = d.emptyWeightLb, emptyArmIn = d.emptyArmIn, emptyOwn = own,
                stations = loading.stations.orEmpty().map { "" }, fuel = number(d.fuelGal),
                grades = grades,
            )
        }

        /** The loading in the airplane's merged profile (airplane_figures). */
        fun loadingOf(now: AirplaneNow): EngineContract.GonogoLoading? {
            val raw = now.profile?.get("loading") ?: return null
            return runCatching { Engine.json.decodeFromJsonElement(EngineContract.GonogoLoading.serializer(), raw) }.getOrNull()
        }

        /** A figure as typed: "170", "8,5" as 8.5; none for nothing or a
         *  word, and none below zero (nothing weighs less than nothing). */
        fun pounds(text: String): Double? = text.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }

        private fun number(v: Double): String = if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
    }
}
