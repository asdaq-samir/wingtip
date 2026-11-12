package app.wingtipmaps.android.map

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.R
import app.wingtipmaps.android.flight.OwnShip
import org.maplibre.android.location.LocationComponentActivationOptions
import org.maplibre.android.location.LocationComponentConstants
import org.maplibre.android.location.LocationComponentOptions
import org.maplibre.android.location.OnCameraTrackingChangedListener
import org.maplibre.android.location.modes.CameraMode
import org.maplibre.android.location.modes.RenderMode
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.Style

/** Own ship as the map draws it: the fix, and whose it is. */
data class OwnShipMark(val fix: OwnShip.Fix? = null, val state: State = State.OFF) {
    enum class State {
        /** The phone's position, read now: grey once its fixes stop coming. */
        ON,

        /** Own ship turned off: the last position kept and drawn grey, not
         *  taken off the map (the owner, 2026-10-06). */
        OFF,

        /** The dry run's airplane, never grey: a run paused is not a
         *  position lost. */
        DRY_RUN,
    }

    companion object {
        /** The dry run's airplane while a run is open, else the phone's
         *  fix, kept and grey once own ship is off. */
        fun of(fix: OwnShip.Fix?, on: Boolean, dryRun: OwnShip.Fix?): OwnShipMark = when {
            dryRun != null -> OwnShipMark(dryRun, State.DRY_RUN)
            else -> OwnShipMark(fix, if (on) State.ON else State.OFF)
        }
    }
}

/**
 * Own ship on the map through MapLibre's own LocationComponent (the
 * owner, 2026-11-12: "I don't want to have bugs with hand built things"):
 * its puck, its accuracy circle, its stale state and its camera tracking,
 * in place of a symbol layer and a camera moved by hand at each fix.
 *
 * The fixes are pushed (forceLocationUpdate) rather than read by the
 * component's own location engine, since OwnShip already reads the fused
 * provider for the alerts ahead, the trail and the logbook, and the dry
 * run's airplane is drawn the same way.
 *
 * The look: with a track, the airplane turned to it (RenderMode.GPS, the
 * GPS's course over the ground, which is what the pilot flies by); with
 * none, the tint's dot in its accuracy circle (RenderMode.NORMAL). The
 * compass modes are not used: a phone's compass in a cockpit reads where
 * the phone points, bent by the airplane's own steel and wiring, not where
 * the airplane goes. Stale or off, the stock grey dot.
 *
 * Following is CameraMode.TRACKING, north up as the map always is; a drag
 * ends it, which the component says (onCameraTrackingDismissed), while a
 * pinch keeps it, as Apple Maps' following does.
 */
internal class OwnShipPuck(private val map: MapLibreMap, private val context: Context, private val onDismissed: () -> Unit) {
    private val component = map.locationComponent
    private var mark = OwnShipMark()
    /** The component's stale state, as its listener last said: stale until
     *  a first fix comes. */
    private var stale = true
    private var forced: OwnShip.Fix? = null
    private var styled: Pair<Boolean, OwnShipMark.State>? = null

    /** Whether the camera is the component's, following the airplane. */
    val tracking: Boolean
        get() = component.isLocationComponentActivated && component.cameraMode != CameraMode.NONE

    /** The component's layers on the first style; a style set anew later
     *  gets them again from the component itself. Under the traffic, which
     *  is drawn over everything. */
    fun activate(style: Style) {
        if (component.isLocationComponentActivated) return
        component.activateLocationComponent(
            LocationComponentActivationOptions.builder(context, style)
                .useDefaultLocationEngine(false)
                .locationComponentOptions(look(plane = false))
                .build(),
        )
        component.addOnLocationStaleListener { isStale ->
            stale = isStale
            restyle()
        }
        component.addOnCameraTrackingChangedListener(object : OnCameraTrackingChangedListener {
            override fun onCameraTrackingDismissed() = onDismissed()

            override fun onCameraTrackingChanged(currentMode: Int) = Unit
        })
    }

    /** The airplane where the fix puts it, and the camera on it while
     *  following: brought to the sectional's scale as following starts,
     *  then only moved, so a pinch the pilot made is kept. */
    // No location engine is the component's, so it reads no location
    // itself; the permission it is annotated with is OwnShip's to hold, and
    // the dry run's airplane needs none.
    @SuppressLint("MissingPermission")
    fun show(next: OwnShipMark, follow: Boolean, reducedMotion: Boolean) {
        mark = next
        if (!component.isLocationComponentActivated) return
        val fix = next.fix
        if (fix == null) {
            component.cameraMode = CameraMode.NONE
            component.isLocationComponentEnabled = false
            return
        }
        component.isLocationComponentEnabled = true
        restyle()
        if (fix != forced) {
            forced = fix
            component.forceLocationUpdate(location(fix))
        }
        when {
            !follow || next.state == OwnShipMark.State.OFF -> component.cameraMode = CameraMode.NONE
            component.cameraMode != CameraMode.TRACKING -> component.setCameraMode(
                CameraMode.TRACKING,
                if (reducedMotion) 0L else FOLLOW_MS.toLong(),
                maxOf(map.cameraPosition.zoom, FOLLOW_ZOOM),
                null,
                null,
                null,
            )
        }
    }

    /** The sheet's room as the padding the component tracks with; false
     *  while it is not tracking, when the map's own camera takes it. */
    fun inset(padding: DoubleArray, durationMs: Long): Boolean {
        if (!tracking) return false
        component.paddingWhileTracking(padding, durationMs)
        return true
    }

    /** The airplane or the dot, styled anew only when which one, or its
     *  state, changes. */
    private fun restyle() {
        if (!component.isLocationComponentActivated) return
        val plane = plane(mark, stale)
        val key = plane to mark.state
        if (key == styled) return
        styled = key
        component.applyStyle(look(plane))
        component.renderMode = if (plane) RenderMode.GPS else RenderMode.NORMAL
    }

    /** The component's options: the brand's tint on its puck and its
     *  accuracy circle, the airplane (own_ship) on its white casing where
     *  there is a track. Off, the stale state comes at once rather than
     *  after STALE_MS, so the dot is grey as own ship is turned off. */
    private fun look(plane: Boolean): LocationComponentOptions {
        val tint = MapStyle.TINT.toColorInt()
        val builder = LocationComponentOptions.builder(context)
            .foregroundTintColor(tint)
            .accuracyColor(tint)
            .layerBelow(MapStyle.TRAFFIC_TREND)
            .enableStaleState(mark.state != OwnShipMark.State.DRY_RUN)
            .staleStateTimeout(if (mark.state == OwnShipMark.State.OFF) AT_ONCE_MS else STALE_MS)
        if (plane) {
            builder.gpsDrawable(R.drawable.own_ship)
                .backgroundDrawable(R.drawable.own_ship_casing)
                .backgroundDrawableStale(R.drawable.own_ship_casing)
        }
        return builder.build()
    }

    companion object {
        /** The sectional's own scale, where the airplane's surroundings
         *  read: the web app's zoom on a position (lib/map). */
        const val FOLLOW_ZOOM = 9.0
        /** Shorter than a fix's second, so the airplane never lags the map. */
        const val FOLLOW_MS = 300
        /** Five fixes missed at one a second (OwnShip.EVERY_MS): the
         *  position is no longer the airplane's, and the dot goes grey. */
        const val STALE_MS = 5_000L
        private const val AT_ONCE_MS = 1L

        /** Whether own ship is the airplane turned to its track: a track,
         *  and a position read now. Stale or off, the dot, grey. */
        fun plane(mark: OwnShipMark, stale: Boolean): Boolean =
            mark.fix?.trackDeg != null && mark.state != OwnShipMark.State.OFF && !stale

        /** The layer the map's own drawings under the airplane go beneath:
         *  the component's lowest, or the traffic's before its layers are in. */
        fun under(style: Style): String =
            if (style.getLayer(LocationComponentConstants.SHADOW_LAYER) != null) LocationComponentConstants.SHADOW_LAYER else MapStyle.TRAFFIC_TREND

        /** A fix as the component reads one: degrees, metres, ms since 1970. */
        fun location(fix: OwnShip.Fix): Location = Location("wingtip").apply {
            latitude = fix.lat
            longitude = fix.lon
            time = fix.atMs
            fix.trackDeg?.let { bearing = it.toFloat() }
            if (!fix.accuracyM.isNaN()) accuracy = fix.accuracyM.toFloat()
        }
    }
}
