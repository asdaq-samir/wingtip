package app.wingtipmaps.android.account

import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.airplane.OwnRecord
import app.wingtipmaps.android.airplane.OwnRemote
import app.wingtipmaps.android.airplane.OwnStore
import app.wingtipmaps.android.api.CookieShelf
import app.wingtipmaps.android.api.CookieStore
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.generated.gateway.OwnFigures
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.flight.OwnTrail
import app.wingtipmaps.android.logbook.FlightRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/** Sign-out and Delete Account leave nothing of the pilot's on the phone
 *  (the store audit's P7): every part forgotten even when one fails, the
 *  two track files gone, the airplanes' figures and the cookies cleared. */
class PhoneWipeTest {
    private val dir: File = Files.createTempDirectory("wipe").toFile()

    private fun fix(atMs: Long, kt: Double) = OwnShip.Fix(42.0, -88.0, 3500.0, 90.0, kt, 5.0, atMs)

    @Test
    fun everyPartIsForgottenEvenWhenOneFails() = runTest {
        val forgotten = mutableListOf<String>()
        val wipe = PhoneWipe(
            listOf(
                "records" to { forgotten += "records" },
                "widget" to { error("the launcher is gone") },
                "cookies" to { forgotten += "cookies" },
            ),
        )
        assertEquals(listOf("widget"), wipe.run())
        assertEquals(listOf("records", "cookies"), forgotten)
    }

    @Test
    fun bothTrackFilesAreGone() = runTest {
        val trailFile = File(dir, "own-trail.json")
        val trail = OwnTrail(trailFile, underway = { (it ?: 0.0) >= 20.0 }, distance = { _, _, _, _ -> Result.success(1.0) }, nowMs = { 1_000L }, writing = Dispatchers.Unconfined)
        trail.took(fix(1_000L, 90.0))
        trail.took(fix(20_000L, 90.0))
        val recordedFile = File(dir, "flight-recorded.json")
        val recorder = FlightRecorder(recordedFile, Dispatchers.Unconfined) { 60_000L }
        recorder.took(fix(1_000L, 90.0))
        recorder.asked(600.0)
        assertTrue(recordedFile.isFile)
        trail.wipe()
        recorder.wipe()
        assertFalse(trailFile.exists())
        assertFalse(recordedFile.exists())
        assertTrue(trail.points.value.isEmpty())
        assertTrue(recorder.recorded.value.points.isEmpty())
        // A new launch reads nothing back.
        assertTrue(FlightRecorder(recordedFile) { 0L }.recorded.value.points.isEmpty())
    }

    @Test
    fun theAirplanesFiguresKeptOnThePhoneAreForgotten() {
        var text: String? = null
        val store = OwnStore({ text }, { text = it })
        store.put(OwnRecord(tail = "N123AB", type = "C172", figures = mapOf("taxi_fuel_gal" to 1.1)))
        val own = OwnAirplanes(store, object : OwnRemote {
            override suspend fun list(): List<AircraftDto>? = null
            override suspend fun add(request: AircraftRequest): AircraftDto = error("signed out")
            override suspend fun update(id: Long, request: AircraftRequest): AircraftDto = error("signed out")
            override suspend fun figures(id: Long, figures: OwnFigures): AircraftDto = error("signed out")
        })
        assertTrue(own.records.value.isNotEmpty())
        own.forget()
        assertTrue(own.records.value.isEmpty())
        assertTrue(store.all().isEmpty())
    }

    @Test
    fun theCookiesAreClearedOnThePhone() {
        val shelf = object : CookieShelf {
            var text: String? = null

            override fun read() = text

            override fun write(text: String) {
                this.text = text
            }
        }
        val url = "https://wingtipmaps.app/api/me".toHttpUrl()
        val session = Cookie.Builder().name("SESSION").value("abc").domain("wingtipmaps.app").path("/")
            .expiresAt(System.currentTimeMillis() + 86_400_000).secure().httpOnly().build()
        val jar = CookieStore(shelf)
        jar.saveFromResponse(url, listOf(session))
        jar.clear()
        assertTrue(jar.loadForRequest(url).isEmpty())
        assertTrue(CookieStore(shelf).loadForRequest(url).isEmpty())
    }
}
