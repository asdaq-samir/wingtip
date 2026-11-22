package app.wingtipmaps.android.ui

import android.content.Context
import android.speech.tts.TextToSpeech
import app.wingtipmaps.android.api.generated.AirportPlace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.runwayProximity
import app.wingtipmaps.android.flight.OwnShip
import java.util.Locale

/**
 * The runway proximity advisor on the own-ship airport diagram (the
 * market-gap report's item 9): own ship against the field's runways and
 * the diagram's hot spots, each fix, by the engine's runway_proximity --
 * "Approaching runway 9-27" on the ground as AC 120-74B 7e(2)(d) has a
 * crew say it at a hold short line, "On runway 27", lined up below the
 * pattern, and the hot spot it nears. Every figure is the engine's (its
 * holding position from AC 150/5300-13B Appendix G, its 3 s and 30 m fix
 * from AC 120-76D 11.17.2, its pattern height from AC 90-66C); this asks
 * it with the airport card's runways (NASR's thresholds and widths) and
 * says its words. A reminder, never a clearance: the signs, the markings
 * and ATC rule.
 */
object RunwayAdvisor {
    /** The advisor's answer for `fix` at the field, null with no fix; a
     *  failure where the engine could not say. */
    fun ask(place: AirportPlace, page: DiagramPage?, fix: OwnShip.Fix?, nowMs: Long): Result<EngineContract.RunwayProximityAnswer?> {
        fix ?: return Result.success(null)
        val asked = EngineContract.RunwayProximityInputFix(
            lat = fix.lat, lon = fix.lon, ageS = (nowMs - fix.atMs) / 1000.0, accuracyM = fix.accuracyM,
            trackDeg = fix.trackDeg, groundspeedKt = fix.groundspeedKt, altitudeFt = fix.altitudeFt,
        )
        val runways = place.runways.map { r ->
            EngineContract.RunwayProximityInputRunwaysItem(
                widthFt = r.widthFt?.toDouble(), closed = r.closed,
                runwayEnds = r.runwayEnds.orEmpty().map { EngineContract.RunwayProximityInputRunwaysItemRunwayEndsItem(ident = it.ident, lat = it.lat, lon = it.lon) },
            )
        }
        val spots = page?.hotSpots.orEmpty().map { EngineContract.RunwayProximityInputHotSpotsItem(name = it.name, lat = it.lat, lon = it.lon) }
        // The field's own pattern height where the FAA publishes one; else
        // the engine takes AC 90-66C's 1,000 ft.
        val pattern = place.pattern?.takeIf { it.published == true }?.aglFt
        return Engine.runwayProximity(fix = asked, elevationFt = place.elevationFt, patternAglFt = pattern, runways = runways, hotSpots = spots)
    }

    /** What to say now and the key then said: the engine's spoken words,
     *  once each time its key changes (a new runway, state or hot spot),
     *  never again for a distance closing; nothing for an answer with no
     *  words, whose key is still kept so the same words met again are. */
    fun toSay(answer: EngineContract.RunwayProximityAnswer?, said: String?): Pair<String?, String?> {
        answer ?: return null to said
        if (answer.key == said) return null to said
        return answer.spoken to answer.key
    }
}

/** The advisor's words said through Android's own TextToSpeech, as the
 *  alerts ahead are (SpokenAlerts), each once (RunwayAdvisor.toSay). */
class RunwayVoice(context: Context) {
    private var said: String? = null
    private var ready = false
    private val voice = TextToSpeech(context.applicationContext) { status -> ready = status == TextToSpeech.SUCCESS }

    fun hear(answer: EngineContract.RunwayProximityAnswer?) {
        val (words, key) = RunwayAdvisor.toSay(answer, said)
        said = key
        if (words != null && ready) {
            voice.language = Locale.US
            // A runway is said at once, over anything queued before it.
            voice.speak(words, TextToSpeech.QUEUE_FLUSH, null, key)
        }
    }

    fun close() = voice.shutdown()
}
