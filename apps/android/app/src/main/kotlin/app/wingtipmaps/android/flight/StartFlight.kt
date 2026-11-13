package app.wingtipmaps.android.flight

/**
 * Whether the location foreground service may run, by the pilot's word
 * (OwnShip, StartFlightAsk): never started by itself, only once the pilot
 * taps Start Flight at flying speed, and let go as the airplane slows
 * below it, when the next flight is asked again. Not Now holds for the
 * rest of the flight. Plain state, so the tests read it without a phone.
 */
class StartFlight {
    private var started = false
    private var declined = false

    /** A fix taken, `flying` or not: whether Start Flight is asked now,
     *  and whether the service runs. */
    fun took(flying: Boolean): Pair<Boolean, Boolean> {
        if (!flying) off()
        return (flying && !started && !declined) to (flying && started)
    }

    fun start() {
        started = true
    }

    fun notNow() {
        declined = true
    }

    /** The flight over, or own ship turned off: asked afresh next time. */
    fun off() {
        started = false
        declined = false
    }
}
