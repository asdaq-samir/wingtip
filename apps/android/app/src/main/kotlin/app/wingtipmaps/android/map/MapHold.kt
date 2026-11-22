package app.wingtipmaps.android.map

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.graphics.PointF
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
 * gesture has an accessible way to do the same). A mouse's right click, a
 * trackpad's two-finger click or a stylus's button pressed asks What's
 * Here too, of the point under the pointer, as the web's right click does
 * and Android's adaptive guidelines ask (Tier 2 Context_Menus): the
 * system's context click, at the pointer's last hover over the map.
 */
internal object MapHold {
    /** Memory short with the app behind, which a lifecycle has no event
     *  for: the map drops what it can (onTrimMemory, as Android 14 calls
     *  in place of onLowMemory). */
    fun memory(view: MapView): ComponentCallbacks2 = object : ComponentCallbacks2 {
        override fun onConfigurationChanged(newConfig: Configuration) {}

        override fun onTrimMemory(level: Int) {
            if (level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) view.onLowMemory()
        }

        @Deprecated("Android 14 calls onTrimMemory in its place")
        override fun onLowMemory() = Unit
    }

    fun attach(view: MapView, map: MapLibreMap, tap: (LatLng) -> Boolean, here: (MapPick) -> Unit) {
        map.addOnMapClickListener { at -> tap(at) }
        map.addOnMapLongClickListener { at ->
            // The pin-drop tap, none under Reduce Motion, as the app's haptics.
            if (!readReduceMotion(view.context)) view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            here(MapPick.Here(at.latitude, at.longitude))
            true
        }
        // Where the pointer last hovered: a context click carries no point.
        var pointer: PointF? = null
        view.setOnHoverListener { _, event ->
            pointer = PointF(event.x, event.y)
            false
        }
        view.setOnContextClickListener {
            val at = pointer ?: return@setOnContextClickListener false
            val point = map.projection.fromScreenLocation(at)
            here(MapPick.Here(point.latitude, point.longitude))
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
