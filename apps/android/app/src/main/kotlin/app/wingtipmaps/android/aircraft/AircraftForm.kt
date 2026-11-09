package app.wingtipmaps.android.aircraft

import app.wingtipmaps.android.api.generated.assistant.HandbookProfile
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.documents.HandbookReview

/**
 * The "Your Airplane" form's fields as typed (the web's own-airplane
 * form in AccountPanels, the iPhone's AircraftForm), checked as the
 * gateway checks them (AircraftRequest's @NotBlank, @Size and
 * @Positive, its 40 to 100 percent cruise power) before the round trip,
 * each problem in the web's words under its field.
 */
data class AircraftForm(
    val tailNumber: String = "",
    val typeDesignator: String = "",
    val cruiseTasKt: String = "",
    val fuelBurnGph: String = "",
    val cruisePowerPct: String = "",
    val climbTasKt: String = "",
    val climbFuelBurnGph: String = "",
    val usableFuelGal: String = "",
    val equipment: String = "",
    val surveillance: String = "",
    val colour: String = "",
) {
    /** What is wrong, by field, in the web's words; empty when it may be saved. */
    val problems: Map<Field, String>
        get() = buildMap {
            val tail = tailNumber.trim()
            val type = typeDesignator.trim()
            if (tail.isEmpty()) put(Field.TAIL, "Tail number is required") else if (tail.length > 16) put(Field.TAIL, "At most 16 characters")
            if (type.isEmpty()) put(Field.TYPE, "Type designator is required") else if (type.length > 16) put(Field.TYPE, "At most 16 characters")
            fun positive(field: Field, value: String, label: String, required: Boolean) {
                val t = value.trim()
                if (t.isEmpty()) {
                    if (required) put(field, "$label must be a positive number")
                } else if ((t.toDoubleOrNull() ?: 0.0) <= 0) {
                    put(field, "$label must be a positive number")
                }
            }
            positive(Field.CRUISE_TAS, cruiseTasKt, "Cruise speed", required = true)
            positive(Field.BURN, fuelBurnGph, "Cruise fuel burn", required = true)
            positive(Field.CLIMB_TAS, climbTasKt, "Climb speed", required = false)
            positive(Field.CLIMB_BURN, climbFuelBurnGph, "Climb fuel burn", required = false)
            positive(Field.USABLE_FUEL, usableFuelGal, "Usable fuel", required = false)
            // A power a cruise table has: 40 to 100 percent, the gateway's
            // limits and the planner's.
            val power = cruisePowerPct.trim()
            if (power.isNotEmpty() && (power.toDoubleOrNull() ?: 0.0) !in 40.0..100.0) put(Field.POWER, "Cruise power must be between 40 and 100%")
            // Flight plan items 10a and 10b are letters and figures, at
            // most 40 and 20 (AIM Appendix 4, TBL 4-2 and 4-3); item 19
            // plain words.
            fun codes(s: String, n: Int) = s.length <= n && s.all { it.code < 128 && it.isLetterOrDigit() }
            if (!codes(equipment.trim(), 40)) put(Field.EQUIPMENT, "Letters and figures, as SDFGRY")
            if (!codes(surveillance.trim(), 20)) put(Field.SURVEILLANCE, "Letters and figures, as B1")
            if (colour.trim().length > 40) put(Field.COLOUR, "At most 40 characters")
        }

    /** The gateway's request, when nothing is wrong. */
    val request: AircraftRequest?
        get() {
            if (problems.isNotEmpty()) return null
            val tas = cruiseTasKt.trim().toDoubleOrNull() ?: return null
            val burn = fuelBurnGph.trim().toDoubleOrNull() ?: return null
            fun opt(s: String) = s.trim().toDoubleOrNull()
            fun words(s: String) = s.trim().ifEmpty { null }
            return AircraftRequest(
                tailNumber = tailNumber.trim().uppercase(), typeDesignator = typeDesignator.trim().uppercase(),
                cruiseTasKt = tas, fuelBurnGph = burn, cruisePowerPct = opt(cruisePowerPct),
                climbTasKt = opt(climbTasKt), climbFuelBurnGph = opt(climbFuelBurnGph), usableFuelGal = opt(usableFuelGal),
                equipment = words(equipment)?.uppercase(), surveillance = words(surveillance)?.uppercase(), colour = words(colour),
            )
        }

    /** The figures a confirmed handbook page gives, only those it gives,
     *  each to a tenth as the form shows them (the iPhone's
     *  HandbookReview.fill). */
    fun filled(p: HandbookProfile): AircraftForm {
        fun pick(v: Double?, was: String) = v?.let(HandbookReview::tenth) ?: was
        return copy(
            cruiseTasKt = pick(p.cruiseTasKt, cruiseTasKt), fuelBurnGph = pick(p.fuelBurnGph, fuelBurnGph),
            cruisePowerPct = pick(p.cruisePowerPct, cruisePowerPct), climbFuelBurnGph = pick(p.climbFuelBurnGph, climbFuelBurnGph),
            usableFuelGal = pick(p.usableFuelGal, usableFuelGal),
        )
    }

    /** Each field left blank taken from the airplane's record, so what
     *  this form was not given is kept as the pilot set it. */
    fun over(was: AircraftDto): AircraftForm {
        val w = of(was)
        fun keep(v: String, k: String) = v.ifBlank { k }
        return AircraftForm(
            tailNumber = keep(tailNumber, w.tailNumber), typeDesignator = keep(typeDesignator, w.typeDesignator),
            cruiseTasKt = keep(cruiseTasKt, w.cruiseTasKt), fuelBurnGph = keep(fuelBurnGph, w.fuelBurnGph),
            cruisePowerPct = keep(cruisePowerPct, w.cruisePowerPct), climbTasKt = keep(climbTasKt, w.climbTasKt),
            climbFuelBurnGph = keep(climbFuelBurnGph, w.climbFuelBurnGph), usableFuelGal = keep(usableFuelGal, w.usableFuelGal),
            equipment = keep(equipment, w.equipment), surveillance = keep(surveillance, w.surveillance), colour = keep(colour, w.colour),
        )
    }

    enum class Field { TAIL, TYPE, CRUISE_TAS, BURN, POWER, CLIMB_TAS, CLIMB_BURN, USABLE_FUEL, EQUIPMENT, SURVEILLANCE, COLOUR }

    companion object {
        /** A figure as the form shows it: whole where it is whole. */
        private fun shown(v: Double?): String = when {
            v == null -> ""
            v == Math.rint(v) -> v.toLong().toString()
            else -> v.toString()
        }

        fun of(a: AircraftDto) = AircraftForm(
            tailNumber = a.tailNumber, typeDesignator = a.typeDesignator,
            cruiseTasKt = shown(a.cruiseTasKt), fuelBurnGph = shown(a.fuelBurnGph), cruisePowerPct = shown(a.cruisePowerPct),
            climbTasKt = shown(a.climbTasKt), climbFuelBurnGph = shown(a.climbFuelBurnGph), usableFuelGal = shown(a.usableFuelGal),
            equipment = a.equipment.orEmpty(), surveillance = a.surveillance.orEmpty(), colour = a.colour.orEmpty(),
        )

        /** "Cruise 110 kt, 8.5 gph at 65% · 40 gal usable". */
        fun figuresLine(a: AircraftDto): String {
            var line = "Cruise ${shown(a.cruiseTasKt)} kt, ${shown(a.fuelBurnGph)} gph"
            a.cruisePowerPct?.let { line += " at ${shown(it)}%" }
            a.usableFuelGal?.let { line += " · ${shown(it)} gal usable" }
            return line
        }
    }
}
