package app.wingtipmaps.android.flight

import android.content.Context
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.notify.LiveFlight
import app.wingtipmaps.android.records.Records
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The flight on this phone, its one owner (Hilt's singleton): the
 * in-flight figures (InFlight), own ship, the path flown (OwnTrail), the
 * traffic, the airplane tracked and the alerts said aloud, each made here
 * once and nowhere else. The screens reach it through their view models
 * (FlightModel); what Hilt does not build -- the agents' actions -- asks
 * Hilt's component for it (`from`, an EntryPoint).
 */
@Singleton
class FlightSession @Inject constructor(@param:ApplicationContext private val context: Context) {
    /** The pieces' own work (the traffic's and the watches' writes and
     *  notifications), on the main thread as the screens read them. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val inFlight: InFlight = InFlight()

    /** The app's one path, in filesDir/own-trail.json. */
    val trail: OwnTrail by lazy { OwnTrail(File(context.filesDir, "own-trail.json")) }
    val ownShip: OwnShip by lazy { OwnShip(context, trail) }
    val tracking: Tracking by lazy { Tracking(context, Records.database(context).dao(), Ticker.shared, scope) }
    val traffic: Traffic by lazy { Traffic(context, Ticker.shared, scope, ownShip, tracking) }
    val spoken: SpokenAlerts by lazy { SpokenAlerts(context) }

    /** A fix taken by the engine for the instruments, and the Live Update
     *  on the status bar (LiveFlight) told the figures it gives. */
    fun took(fix: OwnShip.Fix?, plan: Plan.State) {
        inFlight.took(fix, plan)
        LiveFlight.took(context, inFlight.state.value, plan)
    }

    /** Hilt's way in for what it does not build. */
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Access {
        fun flightSession(): FlightSession
    }

    companion object {
        /** The one session, from Hilt's component, for what Hilt does not build. */
        fun from(context: Context): FlightSession =
            EntryPointAccessors.fromApplication(context.applicationContext, Access::class.java).flightSession()
    }
}
