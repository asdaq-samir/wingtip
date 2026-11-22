package app.wingtipmaps.android.plan

import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.coach.CoachApproaches
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.approachBrief
import app.wingtipmaps.android.engine.generated.approachCoaching
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * An approach picked on the plan's line, opened from its head row's menu
 * (TimelineProcedureRows): its brief and its dry run, the two pages of one
 * sheet (ApproachLessonSheet), as the iPhone's ApproachLesson and the
 * web's Learn This Approach. Every word and figure is the engine's, from
 * the FAA's coded procedure as the planner draws it (the CIFP,
 * /api/airport/{ident}/procedures/{id}) and the field's radio: the brief an
 * instructor has a student give (approach_brief: FAA-H-8083-16B chapter 4;
 * what the coded data does not hold, the minimums above all, is "See the
 * plate"), and the approach flown fix by fix (approach_coaching) at the
 * ground speed picked. A training aid: the plate is what is flown.
 */
class ApproachLesson(
    private val drawn: suspend (String, String) -> EngineContract.ProcedureDrawing = CoachApproaches::drawn,
    private val radio: suspend (String) -> List<EngineContract.FieldFrequency> = { ident ->
        Planner.place(ident).frequencies.map { EngineContract.FieldFrequency(type = it.type, description = it.description, frequencyMhz = it.frequencyMhz) }
    },
) {
    data class State(
        val loading: Boolean = true,
        val name: String? = null,
        val brief: List<EngineContract.ApproachBriefAnswerItem> = emptyList(),
        val steps: List<EngineContract.ApproachCoachingAnswerItem> = emptyList(),
        val step: Int = 0,
        val gsKt: Double = 90.0,
        /** Why the approach could not be had or worked out, said on the sheet. */
        val problem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var drawing: EngineContract.ProcedureDrawing? = null

    /** The approach drawn and its field's radio read, then briefed and
     *  coached; a field whose card cannot be had is briefed with no
     *  frequencies, never made up. */
    suspend fun load(pick: PlanProcedures.Pick) {
        try {
            val d = drawn(pick.ident, pick.id)
            val frequencies = try {
                radio(pick.ident)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                emptyList()
            }
            drawing = d
            val brief = Engine.approachBrief(drawing = d, frequencies = frequencies).getOrThrow()
            _state.update { it.copy(loading = false, name = d.name, brief = brief, problem = null) }
            coach()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, problem = "The ${pick.name} could not be had: ${e.message ?: e::class.simpleName}") }
        }
    }

    /** A final's ground speed picked (SPEEDS), the dry run worked out again. */
    fun pickSpeed(kt: Double) {
        _state.update { it.copy(gsKt = kt) }
        coach()
    }

    fun next() = _state.update { it.copy(step = (it.step + 1).coerceAtMost((it.steps.size - 1).coerceAtLeast(0))) }

    fun back() = _state.update { it.copy(step = (it.step - 1).coerceAtLeast(0)) }

    private fun coach() {
        val d = drawing ?: return
        Engine.approachCoaching(drawing = d, gsKt = _state.value.gsKt).fold(
            onSuccess = { steps -> _state.update { it.copy(steps = steps, step = it.step.coerceAtMost((steps.size - 1).coerceAtLeast(0))) } },
            onFailure = { e -> _state.update { it.copy(steps = emptyList(), problem = "The dry run could not be worked out: ${e.message}") } },
        )
    }

    companion object {
        /** The final's ground speeds to pick from, kt: a discrete setting,
         *  so a segmented control, as the web's lesson and the iPhone's
         *  offer them, 90 to start. */
        val SPEEDS = listOf(70.0, 90.0, 120.0)
    }
}
