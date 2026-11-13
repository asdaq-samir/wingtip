package app.wingtipmaps.android.aircraft

import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.documents.HandbookReview
import app.wingtipmaps.android.documents.model.HandbookProfile
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.aircraftProblems

/**
 * The "Your Airplane" form's fields as typed (the web's own-airplane
 * form in AccountPanels, the iPhone's AircraftForm), checked by the
 * engine's `aircraft_problems` -- the gateway's AircraftRequest limits --
 * before the round trip, each problem in its words under its field.
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
    /** The engine's `aircraft_problems`; a test's own in its place. */
    fun interface Rules {
        fun problems(form: AircraftForm): Result<EngineContract.AircraftProblemsAnswer>
    }

    /** What is wrong, by field, in the engine's words; empty when it may
     *  be saved. Where the engine cannot check the form (Engine.rule has
     *  logged why), that is said under the first field, so a form not
     *  checked is never taken for a good one. */
    fun problems(rules: Rules = EngineRules): Map<Field, String> =
        rules.problems(this).fold(
            onSuccess = { a ->
                listOf(
                    Field.TAIL to a.tailNumber, Field.TYPE to a.typeDesignator, Field.CRUISE_TAS to a.cruiseTasKt,
                    Field.BURN to a.fuelBurnGph, Field.POWER to a.cruisePowerPct, Field.CLIMB_TAS to a.climbTasKt,
                    Field.CLIMB_BURN to a.climbFuelBurnGph, Field.USABLE_FUEL to a.usableFuelGal, Field.EQUIPMENT to a.equipment,
                    Field.SURVEILLANCE to a.surveillance, Field.COLOUR to a.colour,
                ).mapNotNull { (field, words) -> words?.let { field to it } }.toMap()
            },
            onFailure = { mapOf(Field.TAIL to "The airplane could not be checked: ${it.message}") },
        )

    /** The gateway's request, where this form's [problems] are none. */
    fun request(problems: Map<Field, String>): AircraftRequest? {
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

    /** The form as typed, to the engine. */
    object EngineRules : Rules {
        override fun problems(form: AircraftForm) = with(form) {
            Engine.aircraftProblems(
                tailNumber, typeDesignator, cruiseTasKt, fuelBurnGph, cruisePowerPct, climbTasKt,
                climbFuelBurnGph, usableFuelGal, equipment, surveillance, colour,
            )
        }
    }

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
