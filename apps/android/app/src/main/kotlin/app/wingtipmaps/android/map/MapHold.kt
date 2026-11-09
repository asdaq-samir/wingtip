package app.wingtipmaps.android.map

import android.view.HapticFeedbackConstants
import androidx.core.view.ViewCompat
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.readReduceMotion
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView

/**
 * The map's taps and its held finger, kept out of ChartMap: a tap picks
 * what is under it; a finger held asks What's Here of that point, as
 * Maps drops a pin (the iPhone's MapExtras); and TalkBack, which cannot
 * hold a point, has What's Here as a custom action that asks of the
 * map's centre (Android's accessibility guidance, as Apple's HIG: every
 * gesture has an accessible way to do the same).
 */
internal object MapHold {
    fun attach(view: MapView, map: MapLibreMap, tap: (LatLng) -> Boolean, here: (MapPick) -> Unit) {
        map.addOnMapClickListener { at -> tap(at) }
        map.addOnMapLongClickListener { at ->
            // The pin-drop tap, none under Reduce Motion, as the app's haptics.
            if (!readReduceMotion(view.context)) view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            here(MapPick.Here(at.latitude, at.longitude))
            true
        }
        // The camera's target is the middle of what the sheet leaves, as
        // the map's padding sets it: the point the pilot sees in the middle.
        ViewCompat.addAccessibilityAction(view, view.context.getString(R.string.whats_here)) { _, _ ->
            val centre = map.cameraPosition.target ?: return@addAccessibilityAction false
            here(MapPick.Here(centre.latitude, centre.longitude))
            true
        }
    }
}
