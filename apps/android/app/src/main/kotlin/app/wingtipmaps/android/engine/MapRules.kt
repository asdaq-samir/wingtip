package app.wingtipmaps.android.engine

import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.airspaceEntryRules
import app.wingtipmaps.android.engine.generated.faaWords
import app.wingtipmaps.android.engine.generated.fixRadialDistance
import app.wingtipmaps.android.engine.generated.morse
import app.wingtipmaps.android.engine.generated.navaidHours
import app.wingtipmaps.android.engine.generated.placeName
import app.wingtipmaps.android.engine.generated.radialOf
import app.wingtipmaps.android.engine.generated.serviceVolume
import kotlinx.serialization.json.JsonPrimitive

/** A VOR as the rules read it: where it is and the declination its
 *  radials are aligned to (NASR NAV_BASE MAG_VARN, east positive). */
typealias Station = EngineContract.WordingStation

/**
 * What the map's cards say a pilot does with what was tapped, the shared
 * engine's (engine/crates/wording, through the generated calls), as the
 * web's lib/navaid.ts, lib/airspaceRules.ts and lib/advisories.ts ask it:
 * a VOR's radial and the course back to it, its Morse identifier, its
 * service volume and hours; a point's place off the nearest VOR as a
 * controller gives it; what it takes to enter a Class B, C or D and whom
 * to call; and the FAA's capitals in sentence case. The app writes the
 * answers; none is worked out here. Each answer is a Result, so a card
 * says a rule failed where it happened (ProblemLine) rather than leaving
 * the line out as if there were nothing to say.
 */
object MapRules {
    /** The radial of `station` the point is on, the course to fly to it
     *  and how far (`radial_of`), to the station's own declination; null
     *  where it has none filed. */
    fun radialOf(station: Station, lat: Double, lon: Double): Result<EngineContract.RadialOfAnswer?> =
        Engine.radialOf(station, EngineContract.WordingLatLon(lat, lon))

    /** A point off the nearest of `stations`, "JOT 045° 12 nm" (AIM
     *  5-1-6, `fix_radial_distance`); null with none that has a declination. */
    fun fixRadialDistance(lat: Double, lon: Double, stations: List<Station>): Result<String?> =
        Engine.fixRadialDistance(EngineContract.WordingLatLon(lat, lon), stations)

    /** An ident in Morse code, what the station sends (AIM 1-1-3). */
    fun morse(ident: String): Result<String> = Engine.morse(ident)

    /** A VOR's standard service volume by NASR's ALT_CODE (AIM 1-1-8,
     *  TBL 1-1-1). */
    fun serviceVolume(code: String?): Result<String?> = Engine.serviceVolume(code)

    /** A navaid's hours as filed, in words ("24" is "Continuous"). */
    fun navaidHours(hours: String?): Result<String?> = Engine.navaidHours(hours)

    /** What it takes to enter a Class B, C or D, each rule with its
     *  section (14 CFR 91.117, 91.129-91.131, 91.215, 91.225), and the
     *  frequency types to call (`airspace_entry_rules`). */
    fun entryRules(airspaceClass: String): Result<EngineContract.AirspaceEntryRulesAnswer> =
        Engine.airspaceEntryRules(airspaceClass)

    /** The FAA's capitals in sentence case, its codes kept (`faa_words`).
     *  Wording only: where the engine fails (Engine.rule logs it) the
     *  FAA's own text is shown as sent, which is still right. */
    fun faaWords(text: String): String = Engine.faaWords(text = text).map { it.text() ?: text }.getOrDefault(text)

    /** A place's name as it is written, each word capitalised
     *  (`place_name`); the name as filed where the engine fails, as
     *  faaWords. */
    fun placeName(text: String): String = Engine.placeName(text = text).map { it.text() ?: text }.getOrDefault(text)

    /** The rule's one text, where it was asked for one (its answer is a
     *  text for `text`, a list for `texts`). */
    private fun kotlinx.serialization.json.JsonElement.text(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
}
