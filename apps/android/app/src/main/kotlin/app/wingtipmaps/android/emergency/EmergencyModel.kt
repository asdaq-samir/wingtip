package app.wingtipmaps.android.emergency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.generated.EmergencyFields
import app.wingtipmaps.android.checklist.ChecklistSection
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * The emergency assistant's one view model (the web's useEmergency): the
 * fields within a glide ranked by the engine (best_fields) from the
 * planner's /api/emergency/fields round own ship, the field picked, the
 * airplane's own emergency checklist opened at the emergency asked
 * (checklist_section), and the MAYDAY filled from all of it
 * (mayday_call). The views only draw what this gives.
 */
class EmergencyModel(
    private val source: EmergencySource = PlannerEmergency,
    private val rules: EmergencyRules = EngineEmergency,
) : ViewModel() {
    data class State(
        val fix: OwnShip.Fix? = null,
        val ranked: EngineContract.BestFieldsAnswer? = null,
        val picked: EngineContract.BestField? = null,
        /** The field picked's phone and METAR, as the FAA lists them. */
        val phone: String? = null,
        val metar: String? = null,
        val loading: Boolean = false,
        val problem: String? = null,
        val airplaneName: String? = null,
        /** No airplane picked: general guidance in place of its checklist
         *  (`emergency_guidance`), and no glide or figure of any airplane's. */
        val guidance: List<EngineContract.EmergencyGuidanceAnswerItemsItem> = emptyList(),
        val sections: List<ChecklistSection> = emptyList(),
        val section: Int? = null,
        val ticked: Set<String> = emptySet(),
        val mayday: EngineContract.MaydayCallAnswer? = null,
        val souls: String = "",
        val fuelMin: String = "",
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var data: EmergencyFields? = null
    private var asked: Triple<Double, Double, Double?>? = null
    private var asking: Job? = null
    private var pickedIdent: String? = null
    private var aircraft: String? = null
    private var glideRatio: Double? = null
    private var callsign: String? = null
    private var trackMagDeg: Double? = null

    /** Opened for an airplane (none: no glide is guessed) as the planner
     *  is asked it (a stock type, or "own"), with the pilot's own glide
     *  ratio where they gave one, and its own emergency checklist's text as
     *  the pilot kept it. */
    fun start(aircraft: String?, airplaneName: String?, callsign: String?, checklist: String, glideRatio: Double? = null) {
        if (aircraft?.ifEmpty { null } != this.aircraft || glideRatio != this.glideRatio) asked = null
        this.aircraft = aircraft?.ifEmpty { null }
        this.glideRatio = glideRatio
        this.callsign = callsign
        val sections = rules.sections(checklist)
        val section = rules.checklistSection(sections.map { it.title }) ?: if (sections.isNotEmpty()) 0 else null
        val guidance = if (this.aircraft == null) rules.guidance() else emptyList()
        _state.update { it.copy(airplaneName = airplaneName, guidance = guidance, sections = sections, section = section, ticked = emptySet()) }
        refill()
    }

    /** Each fix: the fields asked again once the airplane has moved on
     *  about half a mile or come down 500 ft, and ranked again from it. */
    fun took(fix: OwnShip.Fix?, trackMagDeg: Double?) {
        this.trackMagDeg = trackMagDeg
        _state.update { it.copy(fix = fix) }
        if (fix == null) return
        val at = Triple(step(fix.lat), step(fix.lon), fix.altitudeFt?.let { (it / 500).roundToLong() * 500.0 })
        if (at != asked) {
            asked = at
            asking?.cancel()
            _state.update { it.copy(loading = data == null) }
            asking = viewModelScope.launch {
                try {
                    data = source.fields(at.first, at.second, at.third, aircraft, glideRatio)
                    _state.update { it.copy(loading = false, problem = null) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    _state.update { it.copy(loading = false, problem = if (data == null) "The fields could not be had. Try again." else null) }
                }
                rank()
            }
        } else {
            rank()
        }
    }

    fun pick(ident: String) {
        pickedIdent = ident
        rank()
    }

    fun pickSection(i: Int) = _state.update { it.copy(section = i, ticked = emptySet()) }

    fun tick(key: String) = _state.update { it.copy(ticked = if (key in it.ticked) it.ticked - key else it.ticked + key) }

    fun souls(text: String) {
        _state.update { it.copy(souls = text.filter(Char::isDigit).take(3)) }
        refill()
    }

    fun fuel(text: String) {
        _state.update { it.copy(fuelMin = text.filter(Char::isDigit).take(4)) }
        refill()
    }

    private fun rank() {
        val fix = _state.value.fix
        val got = data
        val ranked = if (fix != null && got != null) rules.bestFields(got, fix).getOrNull() else null
        val picked = ranked?.fields?.firstOrNull { it.ident == pickedIdent } ?: ranked?.fields?.firstOrNull()
        val field = got?.fields?.firstOrNull { it.ident == picked?.ident }
        _state.update { it.copy(ranked = ranked ?: it.ranked, picked = picked ?: it.picked, phone = field?.phone, metar = field?.metar?.raw) }
        refill()
    }

    /** The MAYDAY from what the screen knows; a part not known left for
     *  the pilot to say. */
    private fun refill() {
        val s = _state.value
        val nature = s.section?.let { s.sections.getOrNull(it)?.title } ?: "Engine failure"
        val facts = MaydayFacts(
            callsign = callsign,
            airplaneType = data?.airplane?.type,
            nature = nature,
            intentions = s.picked?.let { "Landing at ${it.name}, ${it.ident}" },
            position = s.fix?.let { position(data) },
            headingMagDeg = trackMagDeg,
            altitudeFt = s.fix?.altitudeFt?.let { (it / 100).roundToInt() * 100.0 },
            fuelMin = s.fuelMin.toDoubleOrNull(),
            souls = s.souls.toDoubleOrNull(),
        )
        _state.update { it.copy(mayday = rules.mayday(facts, data).getOrNull() ?: it.mayday) }
    }

    /** Where the airplane is as a controller gives it: how far and which
     *  way from the nearest field, "3 nm SW of Grand Geneva Resort" (the
     *  airplane from the field: the reciprocal of the bearing to it). */
    private fun position(data: EmergencyFields?): String? {
        val nearest = data?.fields?.minByOrNull { it.distanceNm } ?: return null
        val way = rules.compassWord((nearest.bearingDeg + 180) % 360) ?: return null
        return "${nearest.distanceNm.roundToInt()} nm $way of ${nearest.name}"
    }

    companion object {
        /** How far own ship moves before the fields are asked again: a
         *  hundredth of a degree, about half a mile, as a light single
         *  glides in twenty seconds. */
        const val STEP_DEG = 0.01

        fun step(deg: Double): Double = Math.round(deg / STEP_DEG) * STEP_DEG
    }
}
