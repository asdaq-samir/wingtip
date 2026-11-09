package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.generated.gateway.InspectionsDto
import app.wingtipmaps.android.api.generated.gateway.OwnFigures
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pilot's own airplanes kept on the phone signed out, on the account
 *  signed in, and offered to it at sign-in; the inline ask's one figure
 *  through PUT …/figures, a reset through the whole record. */
class OwnAirplanesTest {
    private class Remote(var signedIn: Boolean = false) : OwnRemote {
        val records = mutableListOf<AircraftDto>()
        val calls = mutableListOf<String>()
        var lastFigures: OwnFigures? = null
        var lastRequest: AircraftRequest? = null

        override suspend fun list() = if (signedIn) records.toList() else null
        override suspend fun add(request: AircraftRequest) = dto(records.size + 1L, request).also {
            calls += "add"
            lastRequest = request
            records += it
        }
        override suspend fun update(id: Long, request: AircraftRequest) = dto(id, request).also {
            calls += "update"
            lastRequest = request
            records.replaceAll { r -> if (r.id == id) it else r }
        }
        override suspend fun figures(id: Long, figures: OwnFigures) = records.first { it.id == id }.let { r ->
            calls += "figures"
            lastFigures = figures
            r.copy(figures = r.figures.copy(taxiFuelGal = figures.taxiFuelGal ?: r.figures.taxiFuelGal)).also { n -> records.replaceAll { if (it.id == id) n else it } }
        }

        fun dto(id: Long, r: AircraftRequest) = AircraftDto(
            createdAt = "2026-11-09", cruiseTasKt = r.cruiseTasKt, fuelBurnGph = r.fuelBurnGph, dueItems = emptyList(),
            figures = r.figures ?: OwnFigures(), id = id, inspections = InspectionsDto(forHire = false), openSquawks = emptyList(),
            tailNumber = r.tailNumber, typeDesignator = r.typeDesignator, cruisePowerPct = r.cruisePowerPct, usableFuelGal = r.usableFuelGal,
        )
    }

    private fun store(): Pair<OwnStore, () -> String?> {
        var text: String? = null
        return OwnStore({ text }, { text = it }) to { text }
    }

    @Test
    fun signedOutTheFiguresAreKeptOnThePhone() = runTest {
        val (store, _) = store()
        val own = OwnAirplanes(store, Remote(signedIn = false))
        own.refresh()
        own.save(OwnRecord(tail = "n123ab", type = "c172", figures = mapOf("cruise_tas_kt" to 122.0, "fuel_burn_gph" to 8.5)), mapOf("taxi_fuel_gal" to 1.1))
        val kept = store.all()["N123AB"]!!
        assertEquals(1.1, kept.figures["taxi_fuel_gal"]!!, 0.0)
        assertEquals(kept, own.records.value["N123AB"])
        // A figure taken away is gone from the phone too.
        own.save(kept, mapOf("taxi_fuel_gal" to null))
        assertNull(store.all()["N123AB"]!!.figures["taxi_fuel_gal"])
    }

    @Test
    fun theAsksOneFigureGoesToTheAccountsFiguresAndAResetToTheRecord() = runTest {
        val remote = Remote(signedIn = true)
        remote.add(AircraftRequest(tailNumber = "N123AB", typeDesignator = "C172", cruiseTasKt = 122.0, fuelBurnGph = 8.5))
        remote.calls.clear()
        val own = OwnAirplanes(store().first, remote)
        own.refresh()
        val record = own.records.value["N123AB"]!!
        own.save(record, mapOf("taxi_fuel_gal" to 1.1))
        assertEquals(listOf("figures"), remote.calls)
        assertEquals(1.1, remote.lastFigures!!.taxiFuelGal!!, 0.0)
        assertEquals(1.1, own.records.value["N123AB"]!!.figures["taxi_fuel_gal"]!!, 0.0)
        // Reset to the book: the whole record, the figure left out of it.
        own.reset(own.records.value["N123AB"]!!, "taxi_fuel_gal", 1.4)
        assertEquals("update", remote.calls.last())
        assertNull(remote.lastRequest!!.figures!!.taxiFuelGal)
    }

    @Test
    fun anAirplaneWithoutItsCruiseAndBurnStaysOnThePhoneSignedIn() = runTest {
        val (store, _) = store()
        val remote = Remote(signedIn = true)
        val own = OwnAirplanes(store, remote)
        own.refresh()
        own.save(OwnRecord(tail = "N9XY"), mapOf("glide_ratio" to 10.0))
        assertTrue(remote.calls.isEmpty())
        assertEquals(10.0, store.all()["N9XY"]!!.figures["glide_ratio"]!!, 0.0)
        // Its cruise and burn given, it goes to the account, of no type.
        own.save(store.all()["N9XY"]!!, mapOf("cruise_tas_kt" to 140.0, "fuel_burn_gph" to 10.0))
        assertEquals(listOf("add"), remote.calls)
        assertEquals(OwnRecord.NO_DESIGNATOR, remote.lastRequest!!.typeDesignator)
        assertNull(store.all()["N9XY"])
        assertEquals("", own.records.value["N9XY"]!!.type)
    }

    @Test
    fun atSignInThePhonesAirplanesAreOfferedAndKept() = runTest {
        val (store, _) = store()
        store.put(OwnRecord(tail = "N123AB", type = "c172", figures = mapOf("cruise_tas_kt" to 122.0, "fuel_burn_gph" to 8.5, "taxi_fuel_gal" to 1.1)))
        val remote = Remote(signedIn = true)
        val own = OwnAirplanes(store, remote)
        own.refresh()
        assertEquals(listOf("N123AB"), own.offer.value.map { it.tail })
        own.keepOnAccount()
        assertEquals(listOf("add"), remote.calls)
        assertEquals(1.1, remote.lastRequest!!.figures!!.taxiFuelGal!!, 0.0)
        assertTrue(own.offer.value.isEmpty())
        assertTrue(store.all().isEmpty())
    }

    @Test
    fun aRecordOfAnotherTypeLendsNoFigures() {
        val records = mapOf("N123AB" to OwnRecord(tail = "N123AB", type = "C172"), "PA28" to OwnRecord(type = "pa28"))
        assertEquals("C172", OwnAirplanes.applicable(records, "n123ab", "c172")?.type)
        assertNull(OwnAirplanes.applicable(records, "N123AB", "sr22"))
        // No N-number: the type's own record.
        assertEquals("pa28", OwnAirplanes.applicable(records, null, "pa28")?.type)
    }

    @Test
    fun aPagesFiguresAreTheHandbooksNotThePilots() {
        val remote = Remote()
        val dto = remote.dto(7, AircraftRequest(tailNumber = "N1", typeDesignator = "ZZZZ", cruiseTasKt = 120.0, fuelBurnGph = 9.0)).copy(
            handbook = app.wingtipmaps.android.api.generated.gateway.HandbookFigures(
                cruise = listOf(app.wingtipmaps.android.api.generated.gateway.Cruise(altitudeFt = 6000.0, burnGph = 9.0, powerPct = 65.0, tasKt = 120.0)),
                envelope = emptyList(), landing = emptyList(), takeoff = emptyList(), usableFuelGal = 50.0,
            ),
        )
        val r = OwnRecord.of(dto)
        assertEquals("", r.type)
        assertEquals(mapOf("cruise_tas_kt" to 120.0, "fuel_burn_gph" to 9.0, "cruise_power_pct" to 65.0, "usable_fuel_gal" to 50.0), r.handbook)
        assertTrue(r.figures.isEmpty())
    }
}
