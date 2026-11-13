package app.wingtipmaps.android.documents

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.LogbookDraftAsk
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import app.wingtipmaps.android.documents.model.DocumentRead
import app.wingtipmaps.android.documents.model.HandbookFigure
import app.wingtipmaps.android.documents.model.HandbookRead
import app.wingtipmaps.android.logbook.LogbookSource
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Add from a Photo against the server's own answers
 * (apps/web/src/lib/fixtures/documentAnswers.json, on the test's
 * classpath, not a copy): each decodes as the app decodes it; the read is
 * reduced to the confirmed items by their keys; a logbook row with no date cannot be confirmed or
 * logged; the flags' tones. No network and no engine.
 */
class DocumentsTest {
    @get:Rule val main = MainRule()

    private val answers: JsonObject = Json.parseToJsonElement(
        checkNotNull(javaClass.classLoader!!.getResource("documentAnswers.json")) { "documentAnswers.json is not on the test's classpath" }.readText(),
    ).jsonObject

    private fun answer(name: String): DocumentRead = Documents.decode(answers.getValue(name).toString())

    @Test
    fun everyAnswerDecodesAsTheAppDecodesIt() {
        val handbook = answer("handbook")
        assertEquals("poh-performance", handbook.kind)
        assertEquals(113.0, handbook.handbookCheck!!.profile.cruiseTasKt!!, 0.0)
        assertEquals("cruise.2", handbook.handbookCheck.profile.cruiseFrom)
        assertTrue(answer("misread").handbookCheck!!.items.any { item -> item.flags.any { it.level == "wrong" } })
        assertEquals(listOf("The bottom row is cut off."), answer("misread").notes)
        // The engine writes counts as numbers; the review makes them whole.
        val logbook = answer("logbook").logbookCheck!!
        assertEquals(3, logbook.rows.size)
        assertEquals(1.0, logbook.rows[0].entry.dayLandings, 0.0)
        assertEquals(2.0, logbook.rows[2].entry.approaches, 0.0)
        assertEquals(1, answer("logbookWrong").logbookCheck!!.flags.size)
        val clearance = answer("clearance").clearance!!
        assertTrue(clearance.said.startsWith("Cleared to KDLH"))
        assertTrue(clearance.written.contains("SQ 4521"))
    }

    @Test
    fun theReadIsReducedToTheConfirmedItems() {
        val read = answer("handbook").handbook!!
        val kept = HandbookReview.confirmed(read, setOf("cruise.2", "takeoff.1", "climb", "weight"))
        assertEquals(listOf(read.cruise!![2]), kept.cruise)
        assertEquals(listOf(read.takeoff!![1]), kept.takeoff)
        assertEquals(emptyList<Any>(), kept.landing)
        assertEquals(read.climb, kept.climb)
        assertEquals(read.maxTakeoffWeight, kept.maxTakeoffWeight)
        assertNull(kept.glide)
        assertNull(kept.empty)
        assertNull(kept.fuel)
        assertEquals(emptyList<Any>(), kept.envelope)
        // The units go with the figures, whatever was confirmed.
        assertEquals(read.speedUnit, kept.speedUnit)
        assertEquals(read.burnUnit, kept.burnUnit)
    }

    @Test
    fun everyKeyTheEngineGivesPicksItsOwnPartOfTheRead() {
        val handbook = answer("handbook")
        val read = handbook.handbook!!
        val all = handbook.handbookCheck!!.items.map { it.key }.toSet()
        assertEquals(read, HandbookReview.confirmed(read, all))
        val none = HandbookReview.confirmed(read, emptySet())
        assertEquals(HandbookRead(
            speedUnit = read.speedUnit, cruiseSpeedKind = read.cruiseSpeedKind, distanceUnit = read.distanceUnit,
            weightUnit = read.weightUnit, armUnit = read.armUnit, fuelUnit = read.fuelUnit, burnUnit = read.burnUnit,
            cruise = emptyList(), takeoff = emptyList(), landing = emptyList(), envelope = emptyList(),
        ), none)
    }

    @Test
    fun confirmedFiguresFillTheFormAndTheSaveAsksTheGatewaysShape() {
        val handbook = answer("handbook")
        var asked: HandbookRead? = null
        val model = HandbookPhotoModel(check = { asked = it; Result.success(handbook.handbookCheck!!) })
        model.take(handbook)
        model.toggle("cruise.2")
        model.toggle("fuel")
        model.toggle("fuel")
        model.toggle("fuel")
        model.useConfirmed(tail = "N12345", type = "c172")
        assertEquals(listOf(handbook.handbook!!.cruise!![2]), asked!!.cruise)
        assertNotNull(asked.fuel)
        val form = model.state.value.form
        assertEquals("113.0", form.cruiseTasKt)
        assertEquals("8.5", form.fuelBurnGph)
        assertEquals("65.0", form.cruisePowerPct)
        assertEquals("53.0", form.usableFuelGal)
        assertEquals("N12345", form.tailNumber)
        assertEquals("C172", form.typeDesignator)
        // The form's check is the engine's (EngineFixturesTest); none here.
        val request = form.request(emptyMap())!!
        assertEquals(113.0, request.cruiseTasKt, 0.0)
        assertEquals("C172", request.typeDesignator)
        assertNull(form.copy(fuelBurnGph = "").request(emptyMap()))
        val figures = HandbookReview.forGateway(handbook.handbookCheck!!.handbook)
        assertEquals(handbook.handbookCheck.handbook.cruise.size, figures.cruise.size)
    }

    @Test
    fun eachKindIsNamedAsTheReadNamesIt() {
        assertEquals(
            listOf("poh-performance", "weight-balance", "logbook-page", "clearance"),
            Documents.Kind.entries.map { it.wire },
        )
    }

    @Test
    fun aRowWithNoDateCannotBeConfirmedOrLogged() {
        val wrong = answer("logbookWrong")
        val rows = wrong.logbookCheck!!.rows
        assertTrue(LogbookReview.canConfirm(rows[0]))
        assertFalse(LogbookReview.canConfirm(rows[1]))
        assertNull(LogbookReview.request(rows[1].entry))
        val servers = Servers()
        val model = LogbookPhotoModel(servers)
        model.take(wrong)
        model.toggle(1)
        model.toggle(2)
        assertEquals(emptySet<Int>(), model.state.value.confirmed)
        model.toggle(0)
        assertEquals(1, model.state.value.toLog)
        model.logConfirmed()
        assertEquals(listOf("2026-12-01"), servers.added.map { it.flownOn })
        assertEquals(setOf(0), model.state.value.logged)
        assertEquals(0, model.state.value.toLog)
    }

    @Test
    fun aConfirmedRowIsLoggedAsTheGatewaysEntry() {
        val entry = answer("logbook").logbookCheck!!.rows[2].entry
        val request = LogbookReview.request(entry)!!
        assertEquals("2026-10-10", request.flownOn)
        assertEquals(1.6, request.totalHours, 0.0)
        assertEquals(3, request.dayLandings)
        assertEquals(2, request.approaches)
        assertTrue(request.holding)
        assertFalse(request.fromTrack)
    }

    @Test
    fun wrongIsTheStopToneAndCheckTheCaution() {
        assertEquals(FlagTone.STOP, FlagTone.of("wrong"))
        assertEquals(FlagTone.CAUTION, FlagTone.of("check"))
        // Every flag the server's sample answers carry has one of the two.
        val levels = listOf("handbook", "misread").flatMap { name -> answer(name).handbookCheck!!.items.flatMap { it.flags } } +
            answer("logbookWrong").logbookCheck!!.let { c -> c.flags + c.rows.flatMap { it.flags } }
        assertEquals(setOf("wrong", "check"), levels.map { it.level }.toSet())
    }

    @Test
    fun figuresReadAsThePagePrintsThem() {
        assertEquals("4,000 ft", HandbookReview.figure(HandbookFigure(path = "cruise.0.altitude_ft", label = "Pressure altitude", value = 4000.0, unit = "ft", appValue = 4000.0, appUnit = "ft")))
        assertEquals("65%", HandbookReview.figure(HandbookFigure(path = "cruise.0.power_pct", label = "Power", value = 65.0, unit = "%", appValue = 65.0, appUnit = "%")))
        assertEquals("30 L → 7.93 gal", HandbookReview.figure(HandbookFigure(path = "fuel.usable", label = "Usable", value = 30.0, unit = "L", appValue = 7.925, appUnit = "gal")))
    }

    private class Servers : LogbookSource {
        val added = mutableListOf<LogbookEntryRequest>()
        override suspend fun draft(ask: LogbookDraftAsk): LogbookDraft = error("not asked")
        override suspend fun add(entry: LogbookEntryRequest): LogbookEntryDto {
            added += entry
            return LogbookEntryDto(
                aircraft = entry.aircraft, airHours = entry.airHours, approaches = entry.approaches, crossCountryHours = entry.crossCountryHours,
                dayLandings = entry.dayLandings, distanceNm = entry.distanceNm, dualHours = entry.dualHours, flownOn = entry.flownOn, fromTrack = false,
                holding = entry.holding, id = added.size.toLong(), instrumentHours = entry.instrumentHours, longestLegNm = entry.longestLegNm,
                nightHours = entry.nightHours, nightLandings = entry.nightLandings, route = entry.route, soloHours = entry.soloHours,
                totalHours = entry.totalHours, touchAndGoes = entry.touchAndGoes, toweredLandings = entry.toweredLandings, tracking = entry.tracking,
            )
        }
        override suspend fun entries() = emptyList<LogbookEntryDto>()
        override suspend fun currency(): CurrencyDto? = null
    }
}
