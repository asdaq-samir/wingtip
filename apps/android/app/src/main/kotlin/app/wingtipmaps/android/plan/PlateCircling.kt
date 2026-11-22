package app.wingtipmaps.android.plan

import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.planned
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Whether an approach's plate publishes circling minimums, as the planner
 * placed the plate (/api/airports/{ident}/procedures/{procedure}/plate,
 * its `circling`; wingtip.plates), kept once asked: what the web reads
 * from its plate query and sends to the engine's landing_runway, so a
 * pilot flying the approach may circle to land on another runway (AIM
 * 5-4-20). Not known until the plate is in, or where the planner has no
 * plate placed: then the rule takes none, the approach's own runway.
 */
class PlateCircling(private val plate: suspend (String, String) -> Boolean?) {
    private val _known = MutableStateFlow<Map<String, Boolean>>(emptyMap())

    /** The flags had so far, by `key`. */
    val known: StateFlow<Map<String, Boolean>> = _known.asStateFlow()

    /** The approach's flag, asked of the planner once; null where it has no plate. */
    suspend fun ask(ident: String, procedure: String): Boolean? {
        val key = key(ident, procedure)
        _known.value[key]?.let { return it }
        val circling = try {
            plate(ident.uppercase(), procedure)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        } ?: return null
        _known.update { it + (key to circling) }
        return circling
    }

    companion object {
        /** The key a flag is kept by, "KOSH:I36", as a pick's key is written. */
        fun key(ident: String, procedure: String): String = "${ident.uppercase()}:$procedure"

        /** The app's one, asking the planner. */
        val shared: PlateCircling by lazy { PlateCircling { ident, procedure -> Planner.api.airportProcedurePlate(ident, procedure).planned().circling } }
    }
}
