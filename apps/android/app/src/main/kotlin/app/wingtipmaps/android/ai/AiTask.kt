package app.wingtipmaps.android.ai

/**
 * What the app asks AI to put in words, one per place it is offered
 * (docs/android-ai.md's screens), each with its ask and how long the
 * answer may be. Every one is under RULES: the figures are the sources',
 * and the model only says them.
 */
enum class AiTask(val ask: String, val maxTokens: Int) {
    /** The Brief: the verdict and the findings that matter. */
    BRIEF("Say this flight's Brief in plain words: the verdict first, then the findings that matter most, in at most four sentences.", 220),

    /** An airport card's METAR and TAF. */
    AIRPORT_WEATHER("Read this airport's weather report and forecast in plain words for a pilot about to fly there, in at most three sentences.", 180),

    /** The route's ranked NOTAMs. */
    NOTAMS("Say which of these NOTAMs matter for this flight and what each means, one short sentence each, most important first; keep each NOTAM's number.", 320),

    /** The route and its nav log. */
    ROUTE("Say this route in plain words: where it goes, the altitude, the time and the fuel, in at most three sentences.", 180),

    /** A flight's debrief from the coach's marks. */
    DEBRIEF("Say how this flight went from the debrief's marks: what was within the standards and what to practise, in at most four sentences.", 220),

    /** A logbook entry's remark. */
    LOGBOOK_REMARK("Write a one-line remark for this logbook entry from its facts, as a pilot writes one: the route and anything of note.", 60),
    ;

    companion object {
        /** The rules every task is asked under, on the phone or on the server. */
        const val RULES =
            "You put a flight planner's figures into plain words for a pilot. Use only the figures in the sources, exactly as written; " +
                "never work out, round, convert or guess a figure, and leave out anything the sources do not say. " +
                "Say \"airplane\", not \"aircraft\". Plain sentences: no lists, no headings, no markdown. " +
                "The pilot decides: never tell them they may not fly; say what the sources warn of."
    }
}
