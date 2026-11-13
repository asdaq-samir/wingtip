package app.wingtipmaps.android.plan

/**
 * The pilot's home airport: the field a route starts from when the pilot
 * names only where to and the phone does not know where it is (the first
 * flight's Plan It, StripModel.route). Its source of truth is the
 * account's home base (the gateway's pilots.home_base, PUT
 * /api/me/contact), as the iPhone reads `session.pilot?.homeBase` before
 * the field kept on the phone, so a signed-in pilot's home follows them
 * to every device; signed out it is the one kept on this phone
 * (FlightChoices.home). Setup's Home Airport sets both (Session.setHomeAirport),
 * and signing in brings the account's to the phone.
 */
object HomeAirport {
    /** The account's home base where it has one, else the phone's; an
     *  ident upper-cased as the planner reads it, blank as none. */
    fun mirrored(account: String?, phone: String?): String? = idOf(account) ?: idOf(phone)

    private fun idOf(ident: String?): String? = ident?.trim()?.uppercase()?.ifEmpty { null }
}
