package app.wingtipmaps.android.coach

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.SavedTrack
import app.wingtipmaps.android.api.generated.CoachDebrief
import app.wingtipmaps.android.api.generated.CoachFinding
import app.wingtipmaps.android.api.generated.CoachProfilePoint
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.approachFind
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * The approaches a saved flight's track flew into its destination, for the
 * coach, as the web's coachDebriefs finds them: the field's instrument
 * approaches drawn by the planner from the FAA's CIFP
 * (/api/airport/{ident}/procedures/{id}), the track held to each by the
 * engine's approach_find (route's approach debrief: which approach it
 * flew, the result, and fix by fix how it was flown, AIM 1-1-9, 1-1-17,
 * 5-4-5 and 14 CFR 91.175), trimmed to what the engine's proficiency_plan
 * reads. Nothing is found or judged here.
 */
object CoachApproaches {
    /** A field's approaches drawn at most: the CIFP lists a dozen at a big one. */
    const val MOST_APPROACHES = 6

    /** The drawing's reader: the planner's own keys, read as the engine's
     *  contract names them (Engine.json's settings, kept apart so reading
     *  one needs no native library). */
    private val drawingJson = Json { ignoreUnknownKeys = true }

    /** An approach debriefed, trimmed: its procedure as the chart names it
     *  ("ILS Y RWY 08"), its profile and findings (the result
     *  among them, in the engine's words), and the field's elevation for
     *  the 500 ft gate (AC 61-98D 2.1.4); a null elevation leaves the gate
     *  unchecked, never assumed. */
    fun trimmed(a: EngineContract.ApproachDebrief, elevationFt: Double?, flownOn: String): CoachDebrief = CoachDebrief(
        kind = "approach", flownOn = flownOn, place = a.airport, procedure = a.name, elevationFt = elevationFt, legs = emptyList(), patterns = emptyList(),
        profile = a.profile.track.map { CoachProfilePoint(altFt = it.altFt, off = it.off, toGoNm = it.toGoNm) },
        findings = a.findings.map { CoachFinding(text = it.text, tone = it.tone) },
    )

    /** The saved track's points as the engine reads them. */
    fun points(track: SavedTrack): List<EngineContract.TrackPoint> =
        track.points.map { EngineContract.TrackPoint(t = it.t.toDouble(), lat = it.lat, lon = it.lon, altFt = it.altFt) }

    /** A procedure as the planner draws it, read as the engine's contract has it. */
    fun drawing(text: String): EngineContract.ProcedureDrawing = drawingJson.decodeFromString(text)

    /** Each approach the track flew, one for each time it came down a final,
     *  debriefed by the engine; none where it flew none, or the engine
     *  refused (logged by Engine.rule). */
    fun found(drawings: List<EngineContract.ProcedureDrawing>, points: List<EngineContract.TrackPoint>, elevationFt: Double?, flownOn: String): List<CoachDebrief> {
        if (drawings.isEmpty()) return emptyList()
        return Engine.approachFind(drawings = drawings, points = points).getOrDefault(emptyList()).map { trimmed(it, elevationFt, flownOn) }
    }

    /** The field's approaches, drawn; one that cannot be had is left out. */
    suspend fun drawings(ident: String): List<EngineContract.ProcedureDrawing> {
        val listed = quietly { Planner.api.airportProcedures(ident).planned() } ?: return emptyList()
        return listed.procedures.filter { it.kind == "approach" }.take(MOST_APPROACHES).mapNotNull { p ->
            quietly { drawn(ident, p.id) }
        }
    }

    /** A procedure as the planner draws it (/api/airport/{ident}/procedures/{id}),
     *  its generated answer read across as the engine's contract has it,
     *  as the clearance's places are (ClearanceRules). */
    suspend fun drawn(ident: String, procedure: String): EngineContract.ProcedureDrawing =
        Engine.json.decodeFromJsonElement(Gateway.json.encodeToJsonElement(Planner.api.airportProcedure(ident, procedure).planned()))

    /** The approaches the track flew into [destination], debriefed and
     *  trimmed; none where the field's approaches cannot be had. */
    suspend fun fetch(destination: String, track: SavedTrack, flownOn: String): List<CoachDebrief> {
        val drawn = drawings(destination)
        if (drawn.isEmpty()) return emptyList()
        val elevation = quietly { Planner.place(destination) }?.elevationFt
        return found(drawn, points(track), elevation, flownOn)
    }

    private suspend fun <T> quietly(read: suspend () -> T?): T? = try {
        read()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}
