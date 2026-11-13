package app.wingtipmaps.android.aircraft

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import app.wingtipmaps.android.R
import app.wingtipmaps.android.aircraft.AircraftForm.Field

/**
 * The "Your Airplane" form's fields: the one form both Your Airplanes
 * and the handbook's Add from a Photo use, so a field added to the
 * record is added here once. Each field's problem, the model's once Save
 * was tried, is said under it, where the pilot fixes it.
 */
@Composable
fun AircraftFormFields(form: AircraftForm, problems: Map<Field, String>, onChange: ((AircraftForm) -> AircraftForm) -> Unit) {
    @Composable
    fun field(@StringRes label: Int, which: Field, value: String, kind: Kind, set: AircraftForm.(String) -> AircraftForm) {
        val problem = problems[which]
        OutlinedTextField(
            value = value,
            onValueChange = { v -> onChange { it.set(v) } },
            label = { Text(stringResource(label)) },
            isError = problem != null,
            supportingText = problem?.let { { Text(it) } },
            singleLine = true,
            keyboardOptions = when (kind) {
                Kind.CODE -> KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false)
                Kind.WORDS -> KeyboardOptions(capitalization = KeyboardCapitalization.Sentences)
                Kind.FIGURE -> KeyboardOptions(keyboardType = KeyboardType.Decimal)
            },
            modifier = Modifier.fillMaxWidth(),
        )
    }

    field(R.string.registration, Field.TAIL, form.tailNumber, Kind.CODE) { copy(tailNumber = it.uppercase()) }
    field(R.string.airplane_type, Field.TYPE, form.typeDesignator, Kind.CODE) { copy(typeDesignator = it.uppercase()) }
    field(R.string.field_cruise_tas, Field.CRUISE_TAS, form.cruiseTasKt, Kind.FIGURE) { copy(cruiseTasKt = it) }
    field(R.string.field_burn, Field.BURN, form.fuelBurnGph, Kind.FIGURE) { copy(fuelBurnGph = it) }
    field(R.string.field_power, Field.POWER, form.cruisePowerPct, Kind.FIGURE) { copy(cruisePowerPct = it) }
    field(R.string.field_climb_tas, Field.CLIMB_TAS, form.climbTasKt, Kind.FIGURE) { copy(climbTasKt = it) }
    field(R.string.field_climb_burn, Field.CLIMB_BURN, form.climbFuelBurnGph, Kind.FIGURE) { copy(climbFuelBurnGph = it) }
    // The descent's speed as the handbook gives it, indicated, and its
    // fuel flow (the owner, 2026-11-13: "Yes to descent and flow").
    field(R.string.field_descent_ias, Field.DESCENT_IAS, form.descentIasKt, Kind.FIGURE) { copy(descentIasKt = it) }
    field(R.string.field_descent_burn, Field.DESCENT_BURN, form.descentFuelBurnGph, Kind.FIGURE) { copy(descentFuelBurnGph = it) }
    field(R.string.field_usable_fuel, Field.USABLE_FUEL, form.usableFuelGal, Kind.FIGURE) { copy(usableFuelGal = it) }
    field(R.string.field_equipment, Field.EQUIPMENT, form.equipment, Kind.CODE) { copy(equipment = it.uppercase()) }
    field(R.string.field_surveillance, Field.SURVEILLANCE, form.surveillance, Kind.CODE) { copy(surveillance = it.uppercase()) }
    field(R.string.field_colour, Field.COLOUR, form.colour, Kind.WORDS) { copy(colour = it) }
}

/** What a field takes, for its keyboard. */
private enum class Kind { CODE, WORDS, FIGURE }
