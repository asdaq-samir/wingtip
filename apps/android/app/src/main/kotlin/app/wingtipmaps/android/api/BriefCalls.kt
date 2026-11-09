package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.DepartureWindow
import app.wingtipmaps.android.api.generated.DepartureWindowAsk
import app.wingtipmaps.android.api.generated.IcingForecast
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
    Gateway.json.decodeFromString(
        fetch("/api/icing/route", mapOf("fixes" to fixes, "alt_ft" to altFt, "leg_min" to legMin, "ground_min" to groundMin, "depart" to depart)),
    )

/** "When should I go?": the Go / No-Go for each departure hour of the
 *  next day or so (POST /api/departure-window), the engine's
 *  departure_window over the planner's briefing of each. */
suspend fun Planner.departureWindow(ask: DepartureWindowAsk): DepartureWindow =
    Gateway.json.decodeFromString(Gateway.send("POST", Config.plannerPath("/api/departure-window"), Gateway.json.encodeToString(ask)))
