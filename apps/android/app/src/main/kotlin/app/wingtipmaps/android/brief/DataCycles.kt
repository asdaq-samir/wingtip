package app.wingtipmaps.android.brief

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.DataCycle
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.dataCycle
import java.time.Instant
import java.time.ZoneOffset

/**
 * The FAA data the planner uses, where an edition is past its cycle, as
 * the web's lib/dataCycles says it: whether it is, is the engine's rule
 * (`data_cycle`, from the FAA's 28 and 56 Day Product Schedule), worked
 * out by the planner and sent with the map's ages (/api/map/ages
 * `data_cycles`), and judged again here on the phone's own day, since a
 * kept answer flown on past an edition's last day still read "in force"
 * (the offline audit of 2026-11-21). An old edition is still used (warn,
 * never limit) and said once in the Brief's caution row: an expired chart
 * read as current is what 14 CFR 91.103 asks a pilot to rule out.
 */
object DataCycles {
    /** The planner's data sets, from its map ages; none where it did not answer. */
    suspend fun fetched(): List<DataCycle> = Planner.api.mapLayerAges().planned().dataCycles.orEmpty()

    /** Each data set judged again on `now`'s day by the engine, on the
     *  edition the planner said it holds; the planner's own judgement
     *  stands where the engine cannot answer. */
    fun onThisDay(
        cycles: List<DataCycle>,
        now: Instant = AppClock.javaNow(),
        judge: (String, String, String) -> EngineContract.DataCycleAnswer? = { kind, edition, on -> Engine.dataCycle(kind, edition, on).getOrNull() },
    ): List<DataCycle> {
        val on = now.atOffset(ZoneOffset.UTC).toLocalDate().toString()
        return cycles.map { c ->
            val edition = c.edition ?: return@map c
            val a = judge(c.kind, edition, on) ?: return@map c
            c.copy(state = a.state, expires = a.expires, current = a.current, behind = a.behind)
        }
    }

    /** One line for the Brief when any data set the plan rests on is past
     *  its cycle, null when none is: "FAA data out of date: charts and
     *  procedures", the web's dataWarning. */
    fun warning(cycles: List<DataCycle>): String? {
        val names = cycles.filter { it.state == "expired" }.map { SHORT[it.key] ?: it.name.lowercase() }
        if (names.isEmpty()) return null
        return "FAA data out of date: ${andList(names)}"
    }

    /** "a", "a and b", "a, b, and c", as the web's andList writes a list
     *  (Intl.ListFormat's en-US, the serial comma). */
    private fun andList(names: List<String>): String = when (names.size) {
        1 -> names[0]
        2 -> "${names[0]} and ${names[1]}"
        else -> names.dropLast(1).joinToString(", ") + ", and " + names.last()
    }

    /** Each data set's name inside a sentence, the web's SHORT. */
    private val SHORT = mapOf(
        "nasr" to "airports and frequencies",
        "charts" to "charts",
        "cifp" to "procedures",
        "dof" to "obstacles",
        "sua" to "special-use airspace",
        "packs" to "offline packs",
    )
}
