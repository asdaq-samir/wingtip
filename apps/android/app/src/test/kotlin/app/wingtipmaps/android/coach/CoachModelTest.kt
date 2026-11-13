package app.wingtipmaps.android.coach

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.CoachAsk
import app.wingtipmaps.android.api.generated.ProficiencyPlan
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.EndorsementDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.TrainingDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate

/** The Coach over fakes of the servers: the ask built from what the
 *  gateway keeps, by the certificate picked; the engine's plan shown,
 *  each session's line; each status in words. */
class CoachModelTest {
    @get:Rule val main = MainRule()

    private val json = Json { ignoreUnknownKeys = true }

    /** A plan as the planner answers one (POST /api/pilot/coach): night
     *  passengers lapsing in 9 days, two unstable approaches into KMSN,
     *  two sessions. */
    private val plan: ProficiencyPlan = json.decodeFromString(
        ProficiencyPlan.serializer(),
        """{"today":"2026-11-09",
        "due":[
          {"key":"flight_review","id":"due:flight_review","label":"Flight review","rule":"14 CFR 61.56(c)","until":"2027-06-30","from":null,"days_left":233,"status":"current","detail":"24 calendar months"},
          {"key":"night_passengers","id":"due:night_passengers","label":"Passengers at night","rule":"14 CFR 61.57(b)","until":"2026-11-18","from":null,"days_left":9,"status":"due_soon","detail":"3 full-stop landings at night in 90 days"},
          {"key":"day_passengers","id":"due:day_passengers","label":"Passengers by day","rule":"14 CFR 61.57(a)","until":null,"from":null,"days_left":null,"status":"lapsed","detail":"3 landings in 90 days"},
          {"key":"instrument","id":"due:instrument","label":"Instrument currency","rule":"14 CFR 61.57(c)","until":null,"from":"2026-12-01","days_left":null,"status":"pending","detail":"6 approaches, holding, tracking"},
          {"key":"medical","id":"due:medical","label":"Medical","rule":"14 CFR 61.23","until":null,"from":null,"days_left":null,"status":"unknown","detail":"Not given"}],
        "reminders":[{"key":"night_passengers","text":"Night passengers lapse in 9 days","until":"2026-11-18","days_left":9}],
        "evidence":[
          {"id":"ev:1","flown_on":"2026-11-02","place":"KMSN","area":"unstable_approach","text":"Below glidepath at 420 ft above the field"},
          {"id":"ev:2","flown_on":"2026-10-20","place":"KMSN","area":"unstable_approach","text":"Off course at 300 ft above the field"},
          {"id":"ev:3","flown_on":"2026-10-01","place":"KJVL","area":"pattern_altitude","text":"Downwind 200 ft high"}],
        "weak_areas":[{"key":"unstable_approach","label":"Stabilized approaches","acs":["IR.VI.B"],"evidence":["ev:1","ev:2"]}],
        "sessions":[
          {"id":"session:1","key":"night_landings","practise":"Three full-stop landings at night","why":["due:night_passengers"],
           "place":{"ident":"KMSN","name":"Dane County Rgnl","distance_nm":12.3,"approach":null},"minutes":60,"instructor":false,"wings":null},
          {"id":"session:2","key":"unstable_approach","practise":"Stabilized approaches","why":["ev:1","ev:2"],
           "place":{"ident":"KMSN","name":"Dane County Rgnl","distance_nm":12.3,"approach":"ILS RWY 18"},"minutes":90,"instructor":true,
           "wings":{"area":"Loss of control","acs":"IR.VI.B","note":"May count"}}]}""",
    )

    private fun entry(flownOn: String, approaches: Int) = LogbookEntryDto(
        airHours = 1.2, approaches = approaches, crossCountryHours = 1.0, dayLandings = 2, distanceNm = 40.0, dualHours = 0.0,
        flownOn = flownOn, fromTrack = false, holding = true, id = 1, instrumentHours = 0.5, longestLegNm = 40.0, nightHours = 0.4,
        nightLandings = 1, soloHours = 0.0, totalHours = 1.4, touchAndGoes = 0, toweredLandings = 1, tracking = true,
    )

    private class Servers(
        var entries: List<LogbookEntryDto>? = emptyList(),
        var training: TrainingDto? = null,
        val plan: ProficiencyPlan,
    ) : CoachSource {
        var asked: CoachAsk? = null
        override suspend fun entries() = entries
        override suspend fun currency() = CurrencyDto(
            approachesInWindow = 0, crossCountryHours = 1.0, flights = 1, holdingInWindow = false, landings = 2, nightHours = 0.4,
            totalHours = 1.4, trackingInWindow = false, flightReviewOn = "2025-06-12", medicalExpiresOn = "2027-03-31",
        )
        override suspend fun training() = training
        override suspend fun home() = "KMSN"
        override suspend fun plan(ask: CoachAsk): ProficiencyPlan { asked = ask; return plan }
    }

    private class Kept(var certificate: Certificate? = null) : CertificateKeeper {
        override fun read() = certificate
        override fun keep(certificate: Certificate) { this.certificate = certificate }
    }

    private fun model(servers: Servers, kept: Kept = Kept()) = CoachModel(servers, kept) { LocalDate.of(2026, 11, 9) }

    @Test
    fun thePlanShowsEachSessionsLine() {
        val servers = Servers(plan = plan)
        val model = model(servers)
        assertTrue(model.state.value.ready)
        assertEquals("KMSN", model.state.value.home)
        model.make()
        val s = model.state.value
        assertEquals(plan, s.plan)
        assertEquals("KMSN · About 60 min", CoachLines.session(plan.sessions[0]))
        assertEquals("KMSN, ILS RWY 18 · About 90 min · With an instructor", CoachLines.session(plan.sessions[1]))
        assertNull(CoachLines.wings(plan.sessions[0]))
        assertEquals("May count toward WINGS: Loss of control, ACS IR.VI.B", CoachLines.wings(plan.sessions[1]))
        val weak = plan.weakAreas.single()
        assertEquals("Stabilized approaches · 2 · ACS IR.VI.B", CoachLines.weakTitle(weak))
        assertEquals(listOf("ev:1", "ev:2"), CoachLines.evidence(plan, weak).map { it.id })
        assertEquals("2 Nov 2026 at KMSN: Below glidepath at 420 ft above the field", CoachLines.evidenceLine(plan.evidence[0]))
        // An approach's line names the procedure flown beside its field.
        assertEquals(
            "2 Nov 2026 at KMSN, ILS Y RWY 08: Below glidepath at 420 ft above the field",
            CoachLines.evidenceLine(plan.evidence[0].copy(procedure = "ILS Y RWY 08")),
        )
    }

    @Test
    fun eachStatusInWords() {
        assertEquals(
            listOf("To 30 Jun 2027", "9 days left", "Lapsed", "From 1 Dec 2026", "Not on record"),
            plan.due.map(CoachLines::status),
        )
        assertEquals(
            listOf(CoachLines.Tone.OK, CoachLines.Tone.CAUTION, CoachLines.Tone.STOP, CoachLines.Tone.CAUTION, CoachLines.Tone.UNKNOWN),
            plan.due.map(CoachLines::tone),
        )
        assertEquals("14 CFR 61.57(b) · 3 full-stop landings at night in 90 days", CoachLines.dueDetail(plan.due[1]))
    }

    @Test
    fun theAskCarriesTheRatingsAndEndorsementsOfTheCertificate() {
        val training = TrainingDto(
            endorsements = listOf(EndorsementDto(code = "A.6", endorsedOn = "2026-09-01")), experience = emptyList(), instructors = emptyList(),
            kinds = emptyList(), knowledgeTestCodes = emptyList(), lessons = emptyList(), reviews = emptyList(), signed = emptyList(),
        )
        val servers = Servers(entries = listOf(entry("2026-10-01", 2)), training = training, plan = plan)
        val kept = Kept()
        val model = model(servers, kept)
        // Endorsements on file: guessed a student until the pilot says.
        assertEquals(Certificate.STUDENT, model.state.value.certificate)
        model.make()
        val student = servers.asked!!
        assertEquals(listOf("student"), student.ratings)
        assertEquals(listOf("A.6" to "2026-09-01"), student.held!!.map { it.code to it.on })
        assertEquals("2026-11-09", student.today)
        assertEquals("KMSN", student.home)
        assertEquals("2025-06-12", student.flightReviewOn)
        assertEquals("2027-03-31", student.medicalExpiresOn)
        assertEquals(emptyList<Any>(), student.debriefs)
        val e = student.entries.single()
        assertEquals("2026-10-01", e.flownOn)
        assertEquals(2, e.approaches)
        assertEquals(1, e.nightLandings)
        assertEquals(true, e.holding)

        model.choose(Certificate.INSTRUMENT)
        assertEquals(Certificate.INSTRUMENT, kept.certificate)
        model.make()
        assertEquals(listOf("private", "instrument"), servers.asked!!.ratings)
        assertEquals(emptyList<Any>(), servers.asked!!.held)

        // The pick is kept on the phone, and wins over the guess.
        assertEquals(Certificate.INSTRUMENT, model(servers, kept).state.value.certificate)
        assertEquals(Certificate.PRIVATE, CoachModel.guessed(emptyList(), null, null))
        assertEquals(Certificate.INSTRUMENT, CoachModel.guessed(listOf(entry("2026-10-01", 1)), null, null))
    }

    @Test
    fun signedOutAsksToSignIn() {
        val model = model(Servers(entries = null, plan = plan))
        assertEquals("Sign in for your plan.", model.state.value.problem)
        model.make()
        assertNull(model.state.value.plan)
    }
}
