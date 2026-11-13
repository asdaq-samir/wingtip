package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.generated.gateway.OwnFigures
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlin.math.abs

/**
 * A pilot's own airplane by its N-number: its type (the planner's stock
 * profile name or an ICAO designator; "" for none known), the figures its
 * pilot gave (FigureKey's keys), those off a photographed handbook page,
 * and its id on the account (null while it is kept on this phone only).
 * An airplane with no N-number given is kept by its type alone.
 */
@Serializable
data class OwnRecord(
    val tail: String? = null,
    val type: String = "",
    val figures: Map<String, Double> = emptyMap(),
    val handbook: Map<String, Double> = emptyMap(),
    val id: Long? = null,
) {
    val key: String get() = key(tail, type)

    /** The figures given over these, a null taking one away. */
    fun with(changes: Map<String, Double?>): OwnRecord {
        val next = figures.toMutableMap()
        changes.forEach { (k, v) -> if (v == null) next.remove(k) else next[k] = v }
        return copy(figures = next)
    }

    /** Enough to plan on with no stock profile under it: the planner's
     *  own airplane needs its cruise speed and burn (wingtip.planning). */
    val plannable: Boolean get() = FigureKey.CRUISE.key in figures && FigureKey.BURN.key in figures

    companion object {
        /** The N-number upper-cased, else the type: one airplane each. */
        fun key(tail: String?, type: String): String = tail?.trim()?.uppercase()?.ifEmpty { null } ?: type.trim().uppercase()

        /** The ICAO designator for a type that has none: "ZZZZ" (FAA
         *  Form 7233-4's item 3 instructions, the type then in item 18's
         *  TYP/), which the gateway's record requires one of. */
        const val NO_DESIGNATOR = "ZZZZ"

        /** A gateway record as the app holds it. The figures read off a
         *  photographed page are its handbook's, not the pilot's: a top
         *  figure the same as its page's cruise row is left to the page. */
        fun of(dto: AircraftDto): OwnRecord {
            val page = handbook(dto)
            val own = buildMap {
                put(FigureKey.CRUISE.key, dto.cruiseTasKt)
                put(FigureKey.BURN.key, dto.fuelBurnGph)
                dto.cruisePowerPct?.let { put(FigureKey.POWER.key, it) }
                dto.usableFuelGal?.let { put(FigureKey.USABLE.key, it) }
                dto.climbTasKt?.let { put(FigureKey.CLIMB_TAS.key, it) }
                dto.climbFuelBurnGph?.let { put(FigureKey.CLIMB_BURN.key, it) }
                dto.descentIasKt?.let { put(FigureKey.DESCENT_IAS.key, it) }
                dto.descentFuelBurnGph?.let { put(FigureKey.DESCENT_BURN.key, it) }
                dto.figures.climbRateFpm?.let { put(FigureKey.CLIMB_RATE.key, it) }
                dto.figures.serviceCeilingFt?.let { put(FigureKey.CEILING.key, it) }
                dto.figures.taxiFuelGal?.let { put(FigureKey.TAXI.key, it) }
                dto.figures.glideRatio?.let { put(FigureKey.GLIDE.key, it) }
                dto.figures.emptyWeightLb?.let { put(FigureKey.EMPTY_WEIGHT.key, it) }
                dto.figures.emptyMomentLbIn?.let { put(FigureKey.EMPTY_MOMENT.key, it) }
            }.filterNot { (k, v) -> page[k]?.let { abs(it - v) < 1e-9 } == true }
            val type = dto.typeDesignator.takeUnless { it.equals(NO_DESIGNATOR, ignoreCase = true) }.orEmpty()
            return OwnRecord(tail = dto.tailNumber.uppercase(), type = type, figures = own, handbook = page, id = dto.id)
        }

        /** The page's figures the engine weighs (its HandbookFigures): the
         *  usable fuel, and the cruise row the record's cruise was taken
         *  from, where it was taken from one. */
        private fun handbook(dto: AircraftDto): Map<String, Double> {
            val page = dto.handbook ?: return emptyMap()
            val row = page.cruise.firstOrNull { abs(it.tasKt - dto.cruiseTasKt) < 1e-9 && abs(it.burnGph - dto.fuelBurnGph) < 1e-9 }
            return buildMap {
                row?.let {
                    put(FigureKey.CRUISE.key, it.tasKt)
                    put(FigureKey.BURN.key, it.burnGph)
                    it.powerPct?.let { p -> put(FigureKey.POWER.key, p) }
                }
                page.usableFuelGal?.let { put(FigureKey.USABLE.key, it) }
            }
        }

        /** The figures the gateway keeps apart (PUT …/figures). */
        fun ownFigures(f: Map<String, Double?>): OwnFigures = OwnFigures(
            climbRateFpm = f[FigureKey.CLIMB_RATE.key], emptyMomentLbIn = f[FigureKey.EMPTY_MOMENT.key],
            emptyWeightLb = f[FigureKey.EMPTY_WEIGHT.key], glideRatio = f[FigureKey.GLIDE.key],
            serviceCeilingFt = f[FigureKey.CEILING.key], taxiFuelGal = f[FigureKey.TAXI.key],
        )

        /** The whole record as the gateway takes it (POST, PUT): every
         *  figure at once, one left out cleared; null without a tail or
         *  the cruise and burn the record requires. What the pilot set on
         *  the web and this screen does not show is kept from `was`. */
        fun request(r: OwnRecord, was: AircraftDto?): AircraftRequest? {
            val tail = r.tail ?: return null
            val all = r.handbook + r.figures
            val cruise = all[FigureKey.CRUISE.key] ?: return null
            val burn = all[FigureKey.BURN.key] ?: return null
            return AircraftRequest(
                tailNumber = tail, typeDesignator = r.type.ifEmpty { NO_DESIGNATOR }.uppercase(),
                cruiseTasKt = cruise, fuelBurnGph = burn, cruisePowerPct = all[FigureKey.POWER.key],
                usableFuelGal = all[FigureKey.USABLE.key], climbTasKt = all[FigureKey.CLIMB_TAS.key],
                climbFuelBurnGph = all[FigureKey.CLIMB_BURN.key], descentIasKt = all[FigureKey.DESCENT_IAS.key],
                descentFuelBurnGph = all[FigureKey.DESCENT_BURN.key], figures = ownFigures(r.figures),
                colour = was?.colour, equipment = was?.equipment, surveillance = was?.surveillance,
            )
        }
    }
}

/**
 * The airplanes a pilot signed out keeps on this phone (the app's
 * preferences), by OwnRecord's key, until they are offered to the account
 * at sign-in. Reads and writes text through the two functions given, so
 * the tests keep it in a string.
 */
class OwnStore(private val read: () -> String?, private val write: (String) -> Unit) {
    @Serializable
    private class Kept(val records: Map<String, OwnRecord> = emptyMap())

    fun all(): Map<String, OwnRecord> =
        read()?.let { runCatching { Gateway.json.decodeFromString<Kept>(it).records }.getOrNull() }.orEmpty()

    fun put(record: OwnRecord) = save(all() + (record.key to record.copy(id = null)))

    fun remove(key: String) = save(all() - key)

    /** Every record on the phone gone. */
    fun clear() = save(emptyMap())

    private fun save(records: Map<String, OwnRecord>) = write(Gateway.json.encodeToString(Kept(records)))
}
