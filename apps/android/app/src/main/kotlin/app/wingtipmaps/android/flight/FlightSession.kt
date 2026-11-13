package app.wingtipmaps.android.flight

import android.content.Context
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.notify.LiveFlight
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The flight on this phone, one owner for the app (Hilt's singleton): the
 * in-flight figures (InFlight), own ship, the path flown (OwnTrail), the
 * traffic, the airplane tracked and the alerts said aloud. The screens
 * reach it through their view models (FlightModel), not each through a
 * singleton of its own. Own ship's service, the widgets and the phone's
 * wipe still reach the same instances by their `of`, since Hilt does not
 * build them; each is made once, here or there, whichever asks first.
 */
@Singleton
class FlightSession @Inject constructor(@param:ApplicationContext private val context: Context) {
    val inFlight: InFlight get() = InFlight.shared
    val ownShip: OwnShip by lazy { OwnShip.of(context) }
    val trail: OwnTrail by lazy { OwnTrail.of(context) }
    val traffic: Traffic by lazy { Traffic.of(context) }
    val tracking: Tracking by lazy { Tracking.of(context) }
    val spoken: SpokenAlerts by lazy { SpokenAlerts.of(context) }

    /** A fix taken by the engine for the instruments, and the Live Update
     *  on the status bar (LiveFlight) told the figures it gives. */
    fun took(fix: OwnShip.Fix?, plan: Plan.State) {
        inFlight.took(fix, plan)
        LiveFlight.took(context, inFlight.state.value, plan)
    }
}
