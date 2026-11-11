package app.wingtipmaps.android.plates

import android.content.Context
import app.wingtipmaps.android.api.Planner
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/**
 * The plate card's model (PlateCard): how the plates are drawn, kept on
 * this phone (PlateLookStore), and the plates on the map (PlatesOnMap),
 * which Hide Plate takes one off; View Full Screen's FAA page, the
 * field's d-TPP chart of the plate's name, which the app's plate viewer
 * opens as the airport card's Approaches rows do. The Map Settings'
 * Approach Plates switch is here too: turned on, it brings back every
 * plate hidden.
 *
 * @param chartUrl the d-TPP chart's address for a field and a plate's name.
 */
class PlateCardModel(
    private val store: PlateLookStore,
    private val plates: PlatesOnMap,
    private val chartUrl: suspend (String, String) -> String?,
) {
    val look: StateFlow<PlateLook> get() = store.look
    val state: StateFlow<PlatesOnMap.State> get() = plates.state

    fun placed(pick: PlatePick): PlacedPlate? = plates.state.value.placed[pick]

    fun hide(pick: PlatePick) = plates.hide(pick)

    fun setAnnotations(on: Boolean) = store.setAnnotations(on)

    fun setInvert(on: Boolean) = store.setInvert(on)

    fun dragOpacity(value: Float) = store.dragOpacity(value)

    /** The drag's end: its place kept. */
    fun keepOpacity() = store.setOpacity(store.look.value.opacity)

    /** The Map Settings' switch: plates on the chart or none, every
     *  hidden one back as it is turned on. */
    fun setShown(on: Boolean) {
        store.setShown(on)
        if (on) plates.showHidden()
    }

    /** The FAA's page of the plate for View Full Screen; null where the
     *  field's charts have none of its name, or none could be had. */
    suspend fun fullScreen(pick: PlatePick): String? {
        val name = placed(pick)?.name ?: return null
        return try {
            chartUrl(pick.ident, name)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        fun of(context: Context) = PlateCardModel(PlateLookStore.of(context), PlatesOnMap.shared) { ident, name ->
            Planner.place(ident).procedures?.firstOrNull { it.name.equals(name, ignoreCase = true) }?.url
        }
    }
}
