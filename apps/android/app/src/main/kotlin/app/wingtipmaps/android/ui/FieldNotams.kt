package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.fieldNames
import app.wingtipmaps.android.engine.generated.notamCard
import app.wingtipmaps.android.engine.generated.notamRead
import app.wingtipmaps.android.engine.generated.tfrRead
import java.time.Instant
import java.util.Locale

/**
 * A field's NOTAMs as its card says them, the web's fieldNotams and
 * notamTimes: each read by the engine for a pilot (`notam_read`: its
 * heading, what it is and its condition in our words, where on the field,
 * its window), a TFR by `tfr_read` from what tfr.faa.gov gives of it.
 * Nothing is judged here; this picks which of the engine's words stand on
 * which line, and lays the times out as ForeFlight's NOTAM list does.
 */
object FieldNotams {
    /** How many the card's NOTAMs show before the title opens the rest:
     *  the engine's first three (notams_ranked says its top three first). */
    const val FIRST = 3

    /** In force unless the planner says it is not yet (in_force false). */
    fun active(n: RankedNotam): Boolean = n.inForce != false

    fun isTfr(n: RankedNotam): Boolean = n.kind == TFR

    /** The field's idents as a NOTAM may write them ("OSH", "KOSH"): the
     *  engine's field_names (FAA JO 7350.9GG 4-1), given in the JVM's unit
     *  tests, where the engine does not load; the ident alone where it
     *  cannot be asked. */
    fun identsOf(ident: String, names: (String) -> List<String>? = { Engine.fieldNames(it).getOrNull() }): List<String> =
        names(ident) ?: listOf(ident)

    /** The NOTAM read by the engine (notam_read); null where it fails, the
     *  NOTAM's words as sent standing in then. */
    fun read(n: RankedNotam, ident: String): EngineContract.NotamReadAnswer? =
        Engine.notamRead(n.raw, identsOf(ident)).getOrNull()

    /** A NOTAM's own card as the engine reads it from its parts
     *  (`notam_card`, FAA Order JO 7930.2): its title, category, effect,
     *  permanence, whether it runs until the charts are updated (given
     *  the feed's end, a firm one keeps it from that) and the procedures it
     *  takes away; null for a TFR, and where it fails, the card then saying
     *  the NOTAM's words (notam_read). */
    fun card(n: RankedNotam, ident: String): EngineContract.NotamCardAnswer? =
        if (isTfr(n)) null else Engine.notamCard(n.raw, identsOf(ident), n.ends).getOrNull()

    /** A TFR read by the engine (tfr_read): its kind as a heading, its
     *  kind and rule, its levels and where it is from the field, its place. */
    fun readTfr(n: RankedNotam): EngineContract.TfrReadAnswer? {
        val t = n.tfr
        return Engine.tfrRead(
            kind = t?.kind, rule = t?.rule, title = t?.title,
            floorFt = t?.floorFt, floorRef = t?.floorRef, ceilingFt = t?.ceilingFt, ceilingRef = t?.ceilingRef,
            overField = t?.overField,
            field = t?.field?.let { EngineContract.TfrPoint(it.lat, it.lon) },
            edge = t?.edge?.let { EngineContract.TfrPoint(it.lat, it.lon) },
        ).getOrNull()
    }

    /** One NOTAM as the card says it: the engine's readings, once. */
    class Said(
        val notam: RankedNotam,
        val read: EngineContract.NotamReadAnswer?,
        val tfr: EngineContract.TfrReadAnswer?,
        val card: EngineContract.NotamCardAnswer? = null,
    ) {
        /** Its first line: what it is and its condition in our words, else
         *  its words written out; a TFR's kind and rule. */
        val what: String get() = (if (tfr != null) tfr.what else read?.what ?: read?.words) ?: notam.raw

        /** Where it is, only where that is not obvious: a NOTAM's place off
         *  the field, a TFR's levels and where it is from the field. */
        val where: String? get() = if (isTfr(notam)) tfr?.where else read?.where

        /** Its own page's heading, its kind ("Runway", "Security TFR"). */
        val heading: String? get() = if (isTfr(notam)) tfr?.heading else read?.heading

        /** Whether the engine had a what of ours, so its words are worth a line too. */
        val ours: Boolean get() = read?.what != null && !isTfr(notam)

        /** The group it is listed under when the list is open. */
        val kind: String? get() = if (isTfr(notam)) null else read?.heading
    }

    fun say(n: RankedNotam, ident: String): Said =
        if (isTfr(n)) Said(n, null, readTfr(n)) else Said(n, read(n, ident), null, card(n, ident))

    /** Its number as a briefer reads it, the field's own name off it on the
     *  field's card ("11/060", not "ORD 11/060"); another place's kept. */
    fun number(n: RankedNotam, ident: String, names: List<String> = identsOf(ident)): String {
        val own = names.firstOrNull { n.id.startsWith("$it ") }
        return own?.let { n.id.drop(it.length + 1) } ?: n.id
    }

    /** The NOTAMs by what they are about, the engine's heading, each kind
     *  where its first NOTAM ranks; a TFR's under null (the card's "TFR"),
     *  one the engine could not head under "" (the card's "Other"). */
    fun kinds(said: List<Said>): List<Pair<String?, List<Said>>> =
        said.groupBy { if (isTfr(it.notam)) null else it.kind ?: "" }.toList()

    /** A feed's time, one with no zone read as UTC; null where it is none. */
    fun instantOf(iso: String?): Instant? {
        if (iso.isNullOrBlank()) return null
        return runCatching { Instant.parse(iso) }
            .recoverCatching { java.time.OffsetDateTime.parse(iso).toInstant() }
            .recoverCatching { Instant.parse(iso + "Z") }
            .getOrNull()
    }

    /** How long, as ForeFlight writes it: "5m" under an hour, "5h05m"
     *  under a day, "4d16h" under ten, "18d" past them. */
    fun span(ms: Long): String {
        val minutes = maxOf(0L, Math.round(ms / 60_000.0))
        val d = minutes / 1440
        val h = minutes % 1440 / 60
        val m = minutes % 60
        return when {
            d >= 10 -> "${d}d"
            d >= 1 -> if (h > 0) "${d}d${h}h" else "${d}d"
            h > 0 -> String.format(Locale.US, "%dh%02dm", h, m)
            else -> "${m}m"
        }
    }

    /** The words in red where they stand in a NOTAM's first line, and no
     *  other (the owner, 2026-11-11: "just the word closed and 'out of
     *  service' should be red and nothing else of the wording"). */
    val RED = Regex("""\bclosed\b|\bout of service\b""", RegexOption.IGNORE_CASE)

    private const val TFR = "tfr"
}
