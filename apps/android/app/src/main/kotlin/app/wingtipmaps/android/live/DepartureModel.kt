package app.wingtipmaps.android.live

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The followed airplane's latest tower departure event, for its card (the
 * web's FlightCard and lib/departureWords): asked by its call sign, else
 * its registration (/api/live/departures, STDDS's TDES), and said in one
 * line. Nothing where the tower sent none.
 */
class DepartureModel(private val source: LiveSource = PlannerLive) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    private val _line = MutableStateFlow<String?>(null)
    val line: StateFlow<String?> = _line.asStateFlow()
    private var asked: String? = null

    fun of(ident: String?) {
        val id = ident?.trim()?.uppercase()?.takeIf { it.length >= 2 }
        if (id == asked) return
        asked = id
        _line.value = null
        if (id == null) return
        viewModelScope.launch {
            val line = try {
                LiveWords.departureLine(source.departures(id).events.firstOrNull())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
            if (asked == id) _line.value = line
        }
    }
}
