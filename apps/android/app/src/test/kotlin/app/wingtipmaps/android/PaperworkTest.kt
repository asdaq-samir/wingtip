package app.wingtipmaps.android

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.PaperworkDto
import app.wingtipmaps.android.records.Paperwork
import org.junit.Assert.assertEquals
import org.junit.Test

/** Setup's Coming Up read from the gateway's PaperworkDto, as
 *  services/gateway/openapi.json spells it, and said by day or by hours. */
class PaperworkTest {
    @Test
    fun whatFallsDueIsReadAndSaidByDayOrHours() {
        val body = """{"today":"2026-11-08","items":[""" +
            """{"what":"elt-battery","title":"ELT battery","rule":"14 CFR 91.207(c)","aircraftId":7,"tailNumber":"N3429J","itemId":null,"dueOn":"2026-11-15","daysLeft":7,"dueAtHours":null,"hoursLeft":null},""" +
            """{"what":"flight-review","title":"Flight review","rule":"14 CFR 61.56(c)","aircraftId":null,"tailNumber":null,"itemId":null,"dueOn":"2026-11-05","daysLeft":-3,"dueAtHours":null,"hoursLeft":null},""" +
            """{"what":"hundred-hour","title":"100-hour inspection","rule":"14 CFR 91.409(b)","aircraftId":7,"tailNumber":"N3429J","itemId":null,"dueOn":null,"daysLeft":null,"dueAtHours":2450.0,"hoursLeft":19.5}]}"""
        val list = Gateway.json.decodeFromString<PaperworkDto>(body)
        assertEquals(listOf("N3429J · ELT battery", "Flight review", "N3429J · 100-hour inspection"), list.items.map(Paperwork::named))
        assertEquals(listOf("In 7 days", "3 days past", "19.5 h to go"), list.items.map(Paperwork::whenWords))
        // The tone is the engine's `due_tone` (EngineFixturesTest holds it
        // to records.json); here, its words taken as the row's tone, by
        // day where there is one, and not known where it fails.
        val asked = mutableListOf<Pair<Double?, Double?>>()
        val tones = mapOf(7.0 to "caution", -3.0 to "stop")
        val rule = Paperwork.ToneRule { days, hours -> asked += days to hours; Result.success(days?.let(tones::get) ?: "ok") }
        assertEquals(listOf(Paperwork.Tone.SOON, Paperwork.Tone.PAST, Paperwork.Tone.FINE), list.items.map { Paperwork.tone(it, rule) })
        assertEquals(listOf(7.0 to null, -3.0 to null, null to 19.5), asked)
        assertEquals(Paperwork.Tone.UNKNOWN, Paperwork.tone(list.items[0]) { _, _ -> Result.success("unknown") })
        assertEquals(Paperwork.Tone.UNKNOWN, Paperwork.tone(list.items[0]) { _, _ -> Result.failure(IllegalStateException("no engine")) })
        assertEquals("14 CFR 91.207(c) · 2026-11-15", Paperwork.detail(list.items[0]))
    }
}
