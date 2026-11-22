package app.wingtipmaps.android.plan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.ProcedureDrawing
import app.wingtipmaps.android.api.generated.ProcedureFix
import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.altitudeLines
import app.wingtipmaps.android.engine.generated.altitudeTyped
import app.wingtipmaps.android.format.Format
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The FAA's procedures the plan's line offers and draws, from the
 * planner's CIFP (/api/airport/{ident}/procedures, and each one picked as
 * it draws it, /api/airport/{ident}/procedures/{id}): a field's list asked
 * once its card says it is open (RouteFieldFacts), so "+ APCH" is offered
 * only for a kind it publishes, and each pick's drawing once, for its
 * fixes' rows. A list that cannot be had offers none of its kinds; a
 * drawing that cannot be had leaves the pick's head row alone, its fixes
 * unsaid rather than guessed.
 */
@HiltViewModel
class RouteProcedures @Inject constructor() : ViewModel() {
    private val _lists = MutableStateFlow<Map<String, ProcedureList>>(emptyMap())
    val lists: StateFlow<Map<String, ProcedureList>> = _lists.asStateFlow()
    private val _drawings = MutableStateFlow<Map<String, ProcedureDrawing>>(emptyMap())
    val drawings: StateFlow<Map<String, ProcedureDrawing>> = _drawings.asStateFlow()
    private val asked = mutableSetOf<String>()

    /** The open fields' lists, each asked once. */
    fun load(open: Collection<String>) {
        val wanted = open.map(String::uppercase).filter { asked.add("list:$it") }
        if (wanted.isEmpty()) return
        viewModelScope.launch {
            for (ident in wanted) quietly { Planner.api.airportProcedures(ident).planned() }?.let { list -> _lists.update { it + (ident to list) } }
        }
    }

    /** Each pick's drawing, its transition's, asked once. */
    fun loadDrawings(picks: List<PlanProcedures.Pick>) {
        val wanted = picks.filter { asked.add("drawing:${drawingKey(it)}") }
        if (wanted.isEmpty()) return
        viewModelScope.launch {
            for (pick in wanted) {
                quietly { Planner.api.airportProcedure(pick.ident, pick.id, pick.transition).planned() }
                    ?.let { d -> _drawings.update { it + (drawingKey(pick) to d) } }
            }
        }
    }

    private suspend fun <T> quietly(ask: suspend () -> T): T? = try {
        ask()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        java.util.logging.Logger.getLogger("Wingtip").info("procedures not had: ${e.message}")
        null
    }

    companion object {
        fun drawingKey(pick: PlanProcedures.Pick) = "${pick.key}:${pick.transition.orEmpty()}"

        /** The procedure's own fixes in the order flown, as the line shows
         *  them: its missed approach's left out, and a runway threshold
         *  ("RW24"), which is the field's, not one of the procedure's. */
        fun fixes(drawing: ProcedureDrawing?): List<ProcedureFix> =
            drawing?.fixes.orEmpty().filter { !it.missed && !threshold(it.ident) }

        fun threshold(ident: String) = ident.startsWith("RW") && ident.getOrNull(2)?.isDigit() == true

        /** A crossing altitude as a pilot types it, read to feet by the
         *  engine (altitude_typed: four or five figures, or a flight
         *  level's three, rounded to the hundred; nothing guessed); a
         *  failure carries the engine's reason. */
        fun crossingTyped(text: String): Result<Int> {
            val read = Engine.altitudeTyped(text).getOrElse { return Result.failure(it) }
            val ft = read.ft ?: return Result.failure(IllegalArgumentException(read.reason))
            return Result.success(Math.round(ft).toInt())
        }

        /** A fix's charted altitude in the chart's words, "at or above
         *  3,000 ft", from its CIFP constraint by the engine's
         *  altitude_lines (ARINC 424-18 5.29); none where it has none. */
        fun charted(fix: ProcedureFix): String? {
            val set = Engine.altitudeLines(fix.minFt?.toDouble(), fix.maxFt?.toDouble()).getOrNull() ?: return null
            val top = set.lines.firstOrNull()?.ft ?: return null
            return when (set.crossing) {
                "at" -> "at ${Format.altitude(top)}"
                "between" -> "${Format.altitude(set.lines.last().ft)} to ${Format.altitude(top)}"
                "at_or_above" -> "at or above ${Format.altitude(top)}"
                "at_or_below" -> "at or below ${Format.altitude(top)}"
                else -> null
            }
        }
    }
}
