package app.wingtipmaps.android.search

/**
 * Why an airport cannot be picked for the point the one search is asked
 * for -- a stop, or an end of the route -- shown greyed beside it in every
 * list, its reason in its detail's place (the web's pickRefusal, the
 * owner, 2026-11-21); none where it can, and none outside a pick. A
 * closed field is never offered (decision 0043: the planner's `closed`
 * label, the engine's field_status, never compared here), and Add a Stop
 * does not take a point the route has already. Pure, for a unit test.
 */
object PickRefusal {
    enum class Why { CLOSED, ON_ROUTE }

    /** `route` is the route's points, its ends and stops. */
    fun of(picking: Boolean, addingStop: Boolean, ident: String, closed: String?, route: List<String>): Why? {
        if (!picking && !addingStop) return null
        if (FieldMarks.closed(closed) != null) return Why.CLOSED
        if (addingStop && route.any { it.equals(ident.trim(), ignoreCase = true) }) return Why.ON_ROUTE
        return null
    }
}
