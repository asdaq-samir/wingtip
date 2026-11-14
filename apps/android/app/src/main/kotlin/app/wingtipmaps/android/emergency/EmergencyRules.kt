package app.wingtipmaps.android.emergency

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.emergencyFields
import app.wingtipmaps.android.api.generated.EmergencyFields
import app.wingtipmaps.android.checklist.ChecklistSection
import app.wingtipmaps.android.checklist.ChecklistText
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.bestFields
import app.wingtipmaps.android.engine.generated.checklistSection
import app.wingtipmaps.android.engine.generated.compassWord
import app.wingtipmaps.android.engine.generated.emergencyGuidance
import app.wingtipmaps.android.engine.generated.magneticVariation
import app.wingtipmaps.android.engine.generated.maydayCall
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import java.time.ZoneOffset

/** What the MAYDAY is filled from: each part not known left for the
 *  pilot to say (AIM 6-3-2(a)(3)'s order is the engine's). */
data class MaydayFacts(
    val callsign: String?,
    val airplaneType: String?,
    val nature: String,
    val intentions: String?,
    val position: String?,
    val headingMagDeg: Double?,
    val altitudeFt: Double?,
    val fuelMin: Double?,
    val souls: Double?,
)

/**
 * The emergency assistant's rules, the shared engine's, by the same names
 * the web's lib/emergency asks them: `best_fields` (the fields within a
 * glide ranked, engine/crates/brief), `mayday_call` (the call, the code,
 * AIM 6-2-2, and the frequencies to try, AIM 6-3-1(d)),
 * `checklist_section` (the section asked, "Engine failure in flight" by
 * default), `magnetic_variation` (the WMM) and `compass_word`. A fake in
 * the tests, which have no engine. Nothing here weighs a field or words a
 * call: it shapes what the planner sent into what the engine reads.
 */
interface EmergencyRules {
    fun bestFields(data: EmergencyFields, fix: OwnShip.Fix): Result<EngineContract.BestFieldsAnswer>
    fun mayday(facts: MaydayFacts, data: EmergencyFields?): Result<EngineContract.MaydayCallAnswer>
    fun checklistSection(titles: List<String>): Int?
    fun sections(text: String): List<ChecklistSection>
    fun compassWord(bearingDeg: Double): String?

    /** With no airplane, what to do in general (`emergency_guidance`: the
     *  AIM's and the Airplane Flying Handbook's, each item sourced). */
    fun guidance(): List<EngineContract.EmergencyGuidanceAnswerItemsItem> = emptyList()
}

/** Where the fields come from: the planner, a fake in the tests. */
fun interface EmergencySource {
    suspend fun fields(lat: Double, lon: Double, altitudeFt: Double?, aircraft: String?, glideRatio: Double?): EmergencyFields
}

val PlannerEmergency = EmergencySource { lat, lon, alt, aircraft, glide -> Planner.emergencyFields(lat, lon, alt, aircraft, glide) }

object EngineEmergency : EmergencyRules {
    /** The planner's shapes into the contract's, member by member by
     *  their names (the same snake case on both sides). */
    private val coder = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private inline fun <reified A, reified B> recast(a: A): B = coder.decodeFromJsonElement(coder.encodeToJsonElement(a))

    override fun bestFields(data: EmergencyFields, fix: OwnShip.Fix): Result<EngineContract.BestFieldsAnswer> {
        val today = AppClock.today(ZoneOffset.UTC).toString()
        val variation = Engine.magneticVariation(fix.lat, fix.lon, date = today).getOrNull()
        val airplane = data.airplane?.let {
            EngineContract.BestFieldsInputAirplane(
                // A pilot's own airplane of no stock type has its glide ratio
                // alone, no best-glide speed (none taken from another
                // airplane): best_fields then works the reach in still air only.
                glide = it.glide?.let { g -> EngineContract.BestFieldsInputAirplaneGlide(g.bestGlideKias, g.ratio) },
                landing = it.landing?.let { l -> recast<_, EngineContract.ShortFieldTable>(l) },
                crosswind = it.crosswind?.let { c -> EngineContract.BestFieldsInputAirplaneCrosswind(c.demonstratedKt) },
                cruiseTasKt = it.cruiseTasKt,
            )
        }
        return Engine.bestFields(
            mode = "glide",
            at = EngineContract.BestFieldsInputAt(fix.lat, fix.lon),
            altitudeFt = fix.altitudeFt, speedKt = fix.groundspeedKt,
            wind = data.wind?.let { EngineContract.BestFieldsInputWind(it.fromDeg, it.kt) },
            variationDeg = variation, airplane = airplane,
            fields = data.fields.map { f ->
                EngineContract.BestFieldsInputFieldsItem(
                    ident = f.ident, name = f.name, lat = f.lat, lon = f.lon, elevationFt = f.elevationFt,
                    runways = f.runways.map { recast(it) }, metar = f.metar?.let { recast(it) },
                    // NASR's status too: best_fields never ranks a closed
                    // field, whatever is sent (decision 0043).
                    towered = f.towered, private = f.isPrivate, military = f.military, status = f.status,
                )
            },
        )
    }

    override fun mayday(facts: MaydayFacts, data: EmergencyFields?): Result<EngineContract.MaydayCallAnswer> =
        Engine.maydayCall(
            callsign = facts.callsign, airplaneType = facts.airplaneType, nature = facts.nature, intentions = facts.intentions,
            position = facts.position, headingMagDeg = facts.headingMagDeg, altitudeFt = facts.altitudeFt,
            fuelMin = facts.fuelMin, souls = facts.souls,
            frequencies = data?.fields.orEmpty().flatMap { f ->
                f.frequencies.orEmpty().map { q -> EngineContract.MaydayCallInputFrequenciesItem(f.ident, q.kind, q.mhz, f.distanceNm) }
            },
        )

    override fun checklistSection(titles: List<String>): Int? =
        Engine.checklistSection(titles).getOrNull()?.toInt()

    override fun sections(text: String): List<ChecklistSection> = ChecklistText.read(text).getOrDefault(emptyList())

    override fun compassWord(bearingDeg: Double): String? = Engine.compassWord(bearingDeg).getOrNull()

    override fun guidance(): List<EngineContract.EmergencyGuidanceAnswerItemsItem> = Engine.emergencyGuidance().getOrNull()?.items.orEmpty()
}
