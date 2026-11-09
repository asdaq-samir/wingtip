package app.wingtipmaps.android.about

import app.wingtipmaps.android.Plan

/**
 * The demo flight About offers: Madison to Oshkosh in a Cessna 172, a
 * short leg over Wisconsin between two towered fields, so a pilot (or a
 * reviewer) trying the app sees a whole plan in one tap. The same flight
 * as the web's (apps/web/src/lib/demoFlight.ts) and the iPhone's
 * (DemoFlight in apps/ios), so all three show the same thing.
 *
 * The airplane is the planner's stock Cessna 172 profile, set as the
 * Airplane tab's menu sets one: the pilot asked for this flight by name,
 * so it is their pick, not an airplane assumed (decision 0011).
 */
object DemoFlight {
    const val DEPARTURE = "KMSN"
    const val DESTINATION = "KOSH"
    val STOPS: List<String> = emptyList()

    /** The planner's profile name (wingtip/aircraft.py). */
    const val AIRPLANE = "c172"

    /** The flight put on the plan and planned. */
    fun fly(plan: Plan) {
        plan.planIn(AIRPLANE, DEPARTURE, DESTINATION, STOPS)
    }
}
