package app.wingtipmaps.android.aircraft

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.generated.gateway.InspectionsDto
import app.wingtipmaps.android.api.generated.gateway.OwnFigures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Your Airplanes: the list fetched or signed out, a form refused in
 *  place until it is as the gateway takes it, an airplane added, changed
 *  and deleted, and the gateway's refusal said in its words. */
class AircraftModelTest {
    @get:Rule val main = MainRule()

    private fun dto(id: Long, tail: String, request: AircraftRequest? = null) = AircraftDto(
        id = id, tailNumber = tail, typeDesignator = request?.typeDesignator ?: "PA28", cruiseTasKt = request?.cruiseTasKt ?: 120.0,
        fuelBurnGph = request?.fuelBurnGph ?: 9.0, cruisePowerPct = request?.cruisePowerPct, equipment = request?.equipment,
        createdAt = "2026-11-09T00:00:00Z", dueItems = emptyList(), inspections = InspectionsDto(forHire = false), openSquawks = emptyList(),
        figures = OwnFigures(),
    )

    @Test
    fun signedOutSaysSo() {
        val m = AircraftModel(list = { null })
        assertTrue(m.state.value.signedOut)
        assertFalse(m.state.value.loading)
    }

    @Test
    fun aFormIsRefusedInPlaceUntilItIsWhole() {
        var added: AircraftRequest? = null
        val m = AircraftModel(list = { emptyList() }, add = { r -> added = r; dto(7, r.tailNumber, r) })
        m.startAdding()
        m.change { it.copy(tailNumber = "n123ab", cruiseTasKt = "0", cruisePowerPct = "30", equipment = "S/G") }
        m.save()
        val e = m.state.value.editing!!
        assertTrue(e.tried)
        assertNull(added)
        val problems = e.form.problems
        assertEquals("Type designator is required", problems[AircraftForm.Field.TYPE])
        assertEquals("Cruise speed must be a positive number", problems[AircraftForm.Field.CRUISE_TAS])
        assertEquals("Cruise fuel burn must be a positive number", problems[AircraftForm.Field.BURN])
        assertEquals("Cruise power must be between 40 and 100%", problems[AircraftForm.Field.POWER])
        assertEquals("Letters and figures, as SDFGRY", problems[AircraftForm.Field.EQUIPMENT])
        m.change { it.copy(typeDesignator = "c182", cruiseTasKt = "135", fuelBurnGph = "12.5", cruisePowerPct = "65", equipment = "sg") }
        m.save()
        val sent = checkNotNull(added)
        assertEquals("N123AB", sent.tailNumber)
        assertEquals("C182", sent.typeDesignator)
        assertEquals(65.0, sent.cruisePowerPct!!, 0.0)
        assertEquals("SG", sent.equipment)
        assertNull(sent.climbTasKt)
        assertNull(m.state.value.editing)
        assertEquals(listOf("N123AB"), m.state.value.airplanes.map { it.tailNumber })
    }

    @Test
    fun aKeptAirplaneIsChangedThenDeleted() {
        val kept = dto(3, "N5TX")
        var updated: Pair<Long, AircraftRequest>? = null
        var deleted: Long? = null
        val m = AircraftModel(
            list = { listOf(kept) },
            update = { id, r -> updated = id to r; dto(id, r.tailNumber, r) },
            delete = { deleted = it },
        )
        m.startEditing(kept)
        assertEquals("120", m.state.value.editing!!.form.cruiseTasKt)
        m.change { it.copy(fuelBurnGph = "8.7") }
        m.save()
        val (id, sent) = checkNotNull(updated)
        assertEquals(3L, id)
        assertEquals(8.7, sent.fuelBurnGph, 0.0)
        assertEquals(8.7, m.state.value.airplanes.single().fuelBurnGph, 0.0)

        m.startEditing(m.state.value.airplanes.single())
        m.confirmDelete(true)
        assertTrue(m.state.value.editing!!.confirmingDelete)
        m.delete()
        assertEquals(3L, deleted)
        assertTrue(m.state.value.airplanes.isEmpty())
        assertNull(m.state.value.editing)
    }

    @Test
    fun theGatewaysRefusalIsSaid() {
        val kept = dto(3, "N5TX")
        val m = AircraftModel(list = { listOf(kept) }, update = { _, _ -> throw Gateway.Refusal(409, "tailNumber already exists") })
        m.startEditing(kept)
        m.save()
        assertEquals("The airplane could not be saved: tailNumber already exists.", m.state.value.problem)
        assertFalse(m.state.value.editing!!.saving)
    }

    @Test
    fun aPagesFiguresKeepWhatItDoesNotGive() {
        val was = dto(3, "N5TX", AircraftRequest(tailNumber = "N5TX", typeDesignator = "PA28", cruiseTasKt = 120.0, fuelBurnGph = 9.0, equipment = "SG"))
        val form = AircraftForm(tailNumber = "N5TX", cruiseTasKt = "118", fuelBurnGph = "8.9").over(was)
        assertEquals("PA28", form.typeDesignator)
        assertEquals("118", form.cruiseTasKt)
        assertEquals("SG", form.equipment)
        assertEquals("Cruise 120 kt, 9 gph", AircraftForm.figuresLine(was))
    }
}
