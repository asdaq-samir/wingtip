package app.wingtipmaps.android.ai.functions

/**
 * What each of the app's actions does, in the words an agent reads: once
 * here, for the AppFunctions Gemini sees (WingtipFunctions'
 * @AppFunctionInstruction) and the tools Gemini Nano is given in the
 * app's own Ask (AgentTools), so the two never say different things.
 * Constants, as an annotation's argument must be.
 */
object FunctionWords {
    const val AIRPORT =
        "Reads an airport's card: name, place, elevation, the latest METAR and TAF as sent, the flight category, runways and whether it is towered. " +
            "Every figure is the FAA's or the weather service's; repeat it, never change it."
    const val SEARCH = "Finds airports whose ident, name or town match the words, at most ten."
    const val NEAREST =
        "Lists the airports nearest the airplane's last position, nearest first, each with the planner's distance in nautical miles and bearing in degrees true."
    const val FREQUENCIES = "Lists an airport's radio frequencies as the FAA's NASR lists them: tower, ground, CTAF, ATIS."
    const val APPROACHES = "Lists an airport's instrument approaches and other terminal charts from the FAA's d-TPP."
    const val ROUTE =
        "Reads the route planned in the app: its waypoints in order, the airplane, cruise altitude, distance, time en route and fuel from the nav log. " +
            "Fails when no route is planned."
    const val NOTAMS = "Lists the NOTAMs along the planned route, ranked by the app for this flight, each as the FAA sent it."
    const val BRIEF =
        "Reads the Brief's Go / No-Go verdict for the planned route as last worked out, and each finding. " +
            "The verdict is the app's; say it as given and tell the pilot to open the Brief to check it again."
    const val AIRPLANES = "Lists the pilot's airplanes: N-number, type, cruise true airspeed and fuel burn as the pilot set them."
    const val LOGBOOK = "Lists the pilot's latest logbook flights, newest first: date, airplane, route, times, landings and approaches."
    const val OPEN_SCREEN =
        "Opens a screen of the app by its id: fpl (the route), airport, airplane, setup, brief (Go / No-Go), navlog, nearest, ask, " +
            "emergency (the Emergency Assistant), checklists, logbook, coach, minimums (personal minimums), downloads (charts offline), " +
            "passengers (passenger briefing), shared, about."
    const val PLAN_ROUTE =
        "Plans a route in the app from a departure to a destination by way of any stops, and opens it. " +
            "The app works out the altitude, legs, winds and fuel; the pilot checks them there."
    const val SHOW_AIRPORT = "Opens an airport's card in the app: its weather, runways, frequencies and diagram."
    const val EMERGENCY =
        "Opens the Emergency Assistant at once: the nearest suitable airports with headings and distances, the emergency frequency and squawk 7700."

    const val P_IDENT = "The airport's FAA or ICAO ident, such as KPAO or PAO."
    const val P_QUERY = "Words to match: an ident, a name or a town."
    const val P_COUNT = "How many flights, 1 to 10."
    const val P_SCREEN = "The screen's id, one of the ids listed."
    const val P_DEP = "The departure airport's ident."
    const val P_DEST = "The destination airport's ident."
    const val P_STOPS = "Idents of the airports or fixes between, in order; empty for a direct route."
}
