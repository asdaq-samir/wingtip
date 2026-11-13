package app.wingtipmaps.android.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.FlightSession
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnShip
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The airport diagram's model (DiagramOwnShipDialog): the FAA's page read
 * for the field asked, or why it could not be, and the airplane on it --
 * the fix the flight holds (FlightSession), whether it is fit to draw and
 * where it falls on the page, each the engine's (DiagramPage) -- asked
 * here rather than in the dialog.
 */
@HiltViewModel
class DiagramModel @Inject constructor(
    @param:ApplicationContext private val context: Context,
    session: FlightSession,
) : ViewModel() {
    data class State(val page: DiagramPage? = null, val problem: String? = null)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** The flight's figures, for the fix to place. */
    val flight: StateFlow<InFlight.State> = session.inFlight.state

    private var reading: Job? = null

    /** The diagram at `url` read for `ident`; the last one's page let go of
     *  first, as a fresh dialog had none. */
    fun open(ident: String, url: String) {
        reading?.cancel()
        _state.value = State()
        reading = viewModelScope.launch {
            _state.value = try {
                DiagramPage.read(url, context.cacheDir)?.let { State(page = it) }
                    ?: State(problem = "The FAA's diagram for $ident could not be read.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                State(problem = Problems.say("The FAA's diagram for $ident could not be fetched", e))
            }
        }
    }

    /** The dialog closed: the page, a large picture, not kept. */
    fun close() {
        reading?.cancel()
        _state.value = State()
    }

    /** The fix to draw now, by the engine's `diagram_fix_usable`. */
    fun usable(fix: OwnShip.Fix?, nowMs: Long): Result<OwnShip.Fix?> = DiagramPage.usable(fix, nowMs)

    /** Where the fix is on the page, by the engine's `diagram_point`. */
    fun place(page: DiagramPage, fix: OwnShip.Fix): EngineContract.DiagramPointAnswer? = page.place(fix).getOrNull()

    /** The line under the page. */
    fun note(page: DiagramPage, fix: Result<OwnShip.Fix?>): String = DiagramPage.note(page, fix)
}
