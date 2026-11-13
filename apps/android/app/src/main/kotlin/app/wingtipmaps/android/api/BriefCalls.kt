package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.Alternates
import app.wingtipmaps.android.api.generated.DepartureWindow
import app.wingtipmaps.android.api.generated.DepartureWindowAsk
import app.wingtipmaps.android.api.generated.IcingForecast
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.NotamsRankedAsk
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

// The Brief's planner calls beside its Go / No-Go (Planner.goNoGo), as
// extensions of Planner, each as the web's lib/api/client asks it.

/** The AWC's forecast icing (CIP and FIP) on each leg at the altitude it
 *  is flown (/api/icing/route, wingtip.icing_forecast; the engine's
 *  icing_forecast_route decides what it says): the nav log's fixes
 *  ("lat,lon;…", one more than its legs), each leg's altitude and ETE,
 *  its minutes on the ground after it, and the departure (now when none). */
suspend fun Planner.icingRoute(fixes: String, altFt: String, legMin: String, groundMin: String, depart: String? = null): IcingForecast =
    api.icingOnTheRoute(fixes, altFt, legMin, groundMin, depart).planned()

/** "When should I go?": the Go / No-Go for each departure hour of the
 *  next day or so (POST /api/departure-window), the engine's
 *  departure_window over the planner's briefing of each. */
suspend fun Planner.departureWindow(ask: DepartureWindowAsk): DepartureWindow =
    api.departureWindow(ask).planned()

/** The flight's NOTAMs and TFRs, those that bear on it first (POST
 *  /api/notams/ranked, the engine's notams_ranked over the FAA's feed):
 *  Ready to fly's Get NOTAMs, the ranking the engine's. */
suspend fun Planner.notamsRanked(ask: NotamsRankedAsk): NotamsRanked =
    api.notamsRanked(ask).planned()

/** One field's own NOTAMs and the TFRs within 5 nm of it, ranked by the
 *  engine's notams_ranked as a route's are and in the same shape (GET
 *  /api/airport/{ident}/notams): the airport card's NOTAMs and its alerts. */
suspend fun Planner.airportNotams(ident: String): NotamsRanked =
    api.airportNotams(ident).planned()

/** Under IFR, the alternate for a flight landing at `dest` at `eta` (ISO
 *  8601), as the web's AlternateSection asks it (GET /api/alternate,
 *  wingtip.alternates over the engine's ifr_alternate_window,
 *  ifr_alternate_destination and ifr_alternate_check): whether the
 *  destination needs one (14 CFR 91.169(b)), the one `filed` checked at
 *  its minimums for the ETA there (91.169(c)), and the nearest fields
 *  that will do, each reached at `tasKt`, the picked airplane's cruise. */
suspend fun Planner.alternate(dest: String, eta: String, tasKt: Double, filed: String?): Alternates =
    api.alternate(dest, eta, tasKt, filed?.ifEmpty { null }).planned()
