package app.wingtipmaps.android.airplane

/**
 * Fly This Airplane, from an airplane's profile: the plan's airplane made
 * this one. An N-number becomes the airplane's registration (FlightChoices'
 * tail) and its record's type the planner's type where the planner has
 * that type's book, so the book fills what the pilot has not given; a type
 * picked alone is flown with no N-number. Nothing is assumed: an
 * N-number with no record and no stock type is flown with no figures, and
 * the plan asks for them where they are needed. Pure, for a unit test.
 */
object FlyThis {
    /** The planner's type (`aircraft`, "" for none) and the N-number ("" for none). */
    data class Choice(val aircraft: String, val tail: String)

    fun choice(tail: String?, type: String?, record: OwnRecord?, stock: Set<String>): Choice {
        val wanted = (record?.type?.ifEmpty { null } ?: type).orEmpty().trim().lowercase()
        return Choice(aircraft = wanted.takeIf { it in stock }.orEmpty(), tail = tail?.trim()?.uppercase().orEmpty())
    }

    /** Whether the airplane shown is the one flown now. */
    fun isFlown(shown: AirplaneNow, flown: AirplaneNow): Boolean =
        if (shown.tail != null) shown.tail.equals(flown.tail, ignoreCase = true)
        else shown.aircraft.isNotEmpty() && shown.aircraft.equals(flown.aircraft, ignoreCase = true) && flown.tail == null
}
