package app.wingtipmaps.android.aircraft

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.generated.gateway.InspectionsDto
import app.wingtipmaps.android.api.generated.gateway.OwnFigures
import app.wingtipmaps.android.engine.generated.EngineContract
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

    /** The engine's check finding nothing wrong. */
    private val fine = AircraftForm.Rules { Result.success(EngineContract.AircraftProblemsAnswer()) }

    private fun dto(id: Long, tail: String, request: AircraftRequest? = null) = AircraftDto(
        id = id, tailNumber = tail, typeDesignator = request?.typeDesignator ?: "PA28", cruiseTasKt = request?.cruiseTasKt ?: 120.0,
        fuelBurnGph = request?.fuelBurnGph ?: 9.0, cruisePowerPct = request?.cruisePowerPct, equipment = request?.equipment,
        descentIasKt = request?.descentIasKt, descentFuelBurnGph = request?.descentFuelBurnGph,
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
        // What is wrong is the engine's `aircraft_problems`, held to
        // aircraftForm.json by EngineFixturesTest; here, its answer.
        var answer = EngineContract.AircraftProblemsAnswer(
            typeDesignator = "Type designator is required", cruisePowerPct = "Cruise power must be between 40 and 100%",
            equipment = "Letters and figures, as SDFGRY",
        )
        var checked: AircraftForm? = null
        var added: AircraftRequest? = null
        val m = AircraftModel(list = { emptyList() }, add = { r -> added = r; dto(7, r.tailNumber, r) }, rules = { f -> checked = f; Result.success(answer) })
        m.startAdding()
        m.change { it.copy(tailNumber = "n123ab", cruiseTasKt = "135", fuelBurnGph = "12.5", cruisePowerPct = "30", equipment = "S/G") }
        assertNull(checked)
        m.save()
        val e = m.state.value.editing!!
        assertTrue(e.tried)
        assertNull(added)
        assertEquals("S/G", checked!!.equipment)
        assertEquals(
            mapOf(
                AircraftForm.Field.TYPE to "Type designator is required",
                AircraftForm.Field.POWER to "Cruise power must be between 40 and 100%",
                AircraftForm.Field.EQUIPMENT to "Letters and figures, as SDFGRY",
            ),
            e.problems,
        )
        // Once tried, each change is checked again.
        answer = EngineContract.AircraftProblemsAnswer()
        m.change { it.copy(typeDesignator = "c182", cruisePowerPct = "65", equipment = "sg") }
        assertTrue(m.state.value.editing!!.problems.isEmpty())
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
    fun aFormTheEngineCouldNotCheckIsNotSaved() {
        var added: AircraftRequest? = null
        val m = AircraftModel(list = { emptyList() }, add = { r -> added = r; dto(7, r.tailNumber, r) }, rules = { Result.failure(IllegalStateException("no engine")) })
        m.startAdding()
        m.change { it.copy(tailNumber = "N123AB", typeDesignator = "C182", cruiseTasKt = "135", fuelBurnGph = "12.5") }
        m.save()
        assertNull(added)
        assertEquals("The airplane could not be checked: no engine", m.state.value.editing!!.problems[AircraftForm.Field.TAIL])
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
            rules = fine,
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
        val m = AircraftModel(list = { listOf(kept) }, update = { _, _ -> throw Gateway.Refusal(409, "tailNumber already exists") }, rules = fine)
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

    @Test
    fun theDescentsTwoFiguresGoToTheGatewayAndComeBack() {
        val form = AircraftForm(tailNumber = "N5TX", typeDesignator = "C172", cruiseTasKt = "110", fuelBurnGph = "8.5", descentIasKt = "100", descentFuelBurnGph = "5")
        val asked = form.request(emptyMap())!!
        assertEquals(100.0, asked.descentIasKt)
        assertEquals(5.0, asked.descentFuelBurnGph)
        val back = AircraftForm.of(dto(3, "N5TX", asked))
        assertEquals("100", back.descentIasKt)
        assertEquals("5", back.descentFuelBurnGph)
    }

    @Test
    fun theEngineChecksEachFigureUnderItsOwnName() {
        // By name: the contract puts the descent's two between the climb's
        // burn and the usable fuel, so none is checked as another.
        val answer = EngineContract.AircraftProblemsAnswer(descentIasKt = "Too slow", usableFuelGal = "Too much")
        val problems = AircraftForm(descentIasKt = "5", usableFuelGal = "900").problems { Result.success(answer) }
        assertEquals("Too slow", problems[AircraftForm.Field.DESCENT_IAS])
        assertEquals("Too much", problems[AircraftForm.Field.USABLE_FUEL])
    }
}
