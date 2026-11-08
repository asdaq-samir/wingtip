package app.wingtipmaps.android.engine

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * What the map's cards say a pilot does with what was tapped, the shared
 * engine's (engine/crates/wording, through Engine.call), as the web's
 * lib/navaid.ts, lib/airspaceRules.ts and lib/advisories.ts ask it: a
 * VOR's radial and the course back to it, its Morse identifier, its
 * service volume and hours; a point's place off the nearest VOR as a
 * controller gives it; what it takes to enter a Class B, C or D and whom
 * to call; and the FAA's capitals in sentence case. The app writes the
 * answers; none is worked out here. Each answers null, or nothing, where
 * the engine cannot (an input it refuses), so a card shows what it has.
 */
object MapRules {
    /** A VOR as the rules read it: where it is and the declination its
     *  radials are aligned to (NASR NAV_BASE MAG_VARN, east positive). */
    @Serializable
    data class Station(
        val ident: String? = null,
        val lat: Double,
        val lon: Double,
        @SerialName("mag_var") val magVar: Double? = null,
    )

    @Serializable
    private class At(val lat: Double, val lon: Double)

    @Serializable
    private class RadialAsk(val station: Station, val at: At)

    @Serializable
    private class FrdAsk(val at: At, val stations: List<Station>)

    @Serializable
    private class Ident(val ident: String?)

    @Serializable
    private class Code(val code: String?)

    @Serializable
    private class Hours(val hours: String?)

    @Serializable
    private class Text(val text: String)

    @Serializable
    private class ClassAsk(@SerialName("class") val airspaceClass: String)

    /** The radial of `station` the point is on, the course to fly to it
     *  and how far (`radial_of`), to the station's own declination; null
     *  where it has none filed. */
    fun radialOf(station: Station, lat: Double, lon: Double): RadialOfAnswerClass? =
        runCatching { Engine.call<RadialAsk, RadialOfAnswerClass?>("radial_of", RadialAsk(station, At(lat, lon))) }.getOrNull()

    /** A point off the nearest of `stations`, "JOT 045° 12 nm" (AIM
     *  5-1-6, `fix_radial_distance`); null with none that has a declination. */
    fun fixRadialDistance(lat: Double, lon: Double, stations: List<Station>): String? =
        runCatching { Engine.call<FrdAsk, String?>("fix_radial_distance", FrdAsk(At(lat, lon), stations)) }.getOrNull()

    /** An ident in Morse code, what the station sends (AIM 1-1-3). */
    fun morse(ident: String): String? = runCatching { Engine.call<Ident, String>("morse", Ident(ident)) }.getOrNull()

    /** A VOR's standard service volume by NASR's ALT_CODE (AIM 1-1-8,
     *  TBL 1-1-1). */
    fun serviceVolume(code: String?): String? = runCatching { Engine.call<Code, String?>("service_volume", Code(code)) }.getOrNull()

    /** A navaid's hours as filed, in words ("24" is "Continuous"). */
    fun navaidHours(hours: String?): String? = runCatching { Engine.call<Hours, String?>("navaid_hours", Hours(hours)) }.getOrNull()

    /** What it takes to enter a Class B, C or D, each rule with its
     *  section (14 CFR 91.117, 91.129-91.131, 91.215, 91.225), and the
     *  frequency types to call (`airspace_entry_rules`). */
    fun entryRules(airspaceClass: String): AirspaceEntryRulesAnswer? =
        runCatching { Engine.call<ClassAsk, AirspaceEntryRulesAnswer>("airspace_entry_rules", ClassAsk(airspaceClass)) }.getOrNull()

    /** The FAA's capitals in sentence case, its codes kept (`faa_words`). */
    fun faaWords(text: String): String = runCatching { Engine.call<Text, String>("faa_words", Text(text)) }.getOrDefault(text)

    /** A place's name as it is written, each word capitalised (`place_name`). */
    fun placeName(text: String): String = runCatching { Engine.call<Text, String>("place_name", Text(text)) }.getOrDefault(text)
}
