package app.wingtipmaps.android.ui

import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.CardAction
import app.wingtipmaps.android.design.generated.CardKind
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Each kind of card's actions are design/card-actions.json's, generated
 * (scripts/build/card-actions.sh) into CardKind as into the web's
 * CARD_ACTIONS, every label the generated wording's, and the airport
 * card's row draws its kind's list (airportKind), as the web's
 * PlaceActions.test.tsx holds its row to the table.
 */
class CardActionsTest {
    // The JVM tests run in the module's folder (apps/android/app).
    private val design: JsonObject by lazy {
        val file = File("../../../design/card-actions.json")
        assertTrue("design/card-actions.json is missing", file.exists())
        Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun constant(name: String) = name.replace(Regex("([A-Z])"), "_$1").uppercase()

    @Test
    fun everyAndroidKindIsTheDesignsInItsOrder() {
        val cards = design.getValue("cards").jsonObject
        CardKind.entries.forEach { kind ->
            val card = cards.entries.single { constant(it.key) == kind.name }.value.jsonObject
            val listed = card.getValue("actions").jsonArray.map { constant(it.jsonPrimitive.content) }
            assertEquals(kind.name, listed, kind.actions.map { it.name })
        }
    }

    @Test
    fun theAirportRowIsItsKindsActions() {
        assertEquals(listOf(CardAction.FLY_HERE, CardAction.ADD_STOP, CardAction.CALL, CardAction.FAVORITE), airportKind(asStop = false, stopOff = false).actions)
        // Where Add Stop cannot be used, Address in its place, last (the owner, 2026-11-20).
        assertEquals(listOf(CardAction.FLY_HERE, CardAction.CALL, CardAction.FAVORITE, CardAction.ADDRESS), airportKind(asStop = false, stopOff = true).actions)
        // Opened while a stop is asked for: Add Stop first, no Fly Here, Address last, either way.
        assertEquals(CardKind.AIRPORT_AS_STOP, airportKind(asStop = true, stopOff = true))
        assertEquals(listOf(CardAction.ADD_STOP, CardAction.CALL, CardAction.FAVORITE, CardAction.ADDRESS), CardKind.AIRPORT_AS_STOP.actions)
    }

    @Test
    fun everyLabelIsTheGeneratedWording() {
        assertEquals(R.string.wording_fly_here, CardAction.FLY_HERE.label)
        assertEquals(R.string.wording_add_stop, CardAction.ADD_STOP.label)
        assertEquals(R.string.wording_hold_here, CardAction.HOLD_HERE.label)
        assertEquals(R.string.wording_copy, CardAction.COPY.label)
        // Fly Here and Direct To one glyph, Add Stop and Add to Route another's, as the concept table draws them.
        assertEquals(CardAction.DIRECT_TO.icon, CardAction.FLY_HERE.icon)
        assertEquals(CardAction.ADD_TO_ROUTE.icon, CardAction.ADD_STOP.icon)
    }
}
