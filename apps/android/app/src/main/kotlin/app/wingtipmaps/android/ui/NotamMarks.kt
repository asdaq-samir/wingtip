package app.wingtipmaps.android.ui

import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.notamSubject
import app.wingtipmaps.android.plates.APPROACH_CHART

/** A badge on one of the card's things: the engine's word, how bad and
 *  what it says, and the NOTAMs in force on it, the worst's first. */
data class NotamMark(val word: String, val severity: String, val label: String, val notams: List<RankedNotam>) {
    /** Closed, or not to be used: red; the rest the caution's colours. */
    val unusable: Boolean get() = severity == UNUSABLE

    private companion object {
        const val UNUSABLE = "unusable"
    }
}

/**
 * What each of the field's NOTAMs addresses on its card, as the engine
 * reads it (`notam_subject`: JO 7930.2's keywords and conditions, matched
 * to the card's own runways, lights, approaches and frequencies), as
 * badges by what they go next to: the field and its fuel, its runways,
 * lights and frequencies by their index in the place's lists, its
 * approaches by their chart's address. The owner, 2026-11-11: "For
 * anything the notam addresses, just put a badge next to it". One not
 * yet in force has none: it is in the NOTAMs list, marked Inactive ("If
 * notam is not active, no need to put a caution badge on the thing").
 */
data class NotamMarks(
    val field: NotamMark? = null,
    val fuel: NotamMark? = null,
    val runway: Map<Int, NotamMark> = emptyMap(),
    val light: Map<Int, NotamMark> = emptyMap(),
    val frequency: Map<Int, NotamMark> = emptyMap(),
    val approach: Map<String, NotamMark> = emptyMap(),
) {
    companion object {
        val NONE = NotamMarks()

        fun of(notams: List<RankedNotam>, place: AirportPlace): NotamMarks {
            val approaches = place.procedures.orEmpty().filter { it.kind == APPROACH_CHART }
            val idents = FieldNotams.identsOf(place.ident)
            val runways = place.runways.map { it.ends.orEmpty() }
            val lights = place.lights.orEmpty().map { EngineContract.NotamSubjectInputLightsItem(it.code, it.name, it.runways) }
            val frequencies = place.frequencies.map { EngineContract.NotamSubjectInputFrequenciesItem(it.type, it.frequencyMhz) }
            var field: NotamMark? = null
            var fuel: NotamMark? = null
            val runway = mutableMapOf<Int, NotamMark>()
            val light = mutableMapOf<Int, NotamMark>()
            val frequency = mutableMapOf<Int, NotamMark>()
            val approach = mutableMapOf<String, NotamMark>()
            for (n in notams) {
                if (!FieldNotams.active(n)) continue
                val badges = Engine.notamSubject(n.raw, FieldNotams.isTfr(n), idents, runways, lights, approaches.map { it.name }, frequencies).getOrNull()?.badges.orEmpty()
                for (b in badges) {
                    val i = b.index ?: -1
                    when (b.on) {
                        "field" -> field = add(field, b, n)
                        "fuel" -> fuel = add(fuel, b, n)
                        "runway" -> runway[i] = add(runway[i], b, n)
                        "light" -> light[i] = add(light[i], b, n)
                        "frequency" -> frequency[i] = add(frequency[i], b, n)
                        "approach" -> approaches.getOrNull(i)?.url?.let { url -> approach[url] = add(approach[url], b, n) }
                    }
                }
            }
            return NotamMarks(field, fuel, runway, light, frequency, approach)
        }

        /** One more NOTAM on a thing: its badge where it is the worse (a
         *  closure over a caution), else the first's, in the engine's order. */
        private fun add(prior: NotamMark?, b: EngineContract.NotamSubjectAnswerBadgesItem, n: RankedNotam): NotamMark {
            val mark = NotamMark(b.word, b.severity, b.label, listOf(n))
            if (prior == null) return mark
            val notams = if (n in prior.notams) prior.notams else prior.notams + n
            return if (!prior.unusable && mark.unusable) mark.copy(notams = listOf(n) + notams.filter { it != n }) else prior.copy(notams = notams)
        }
    }
}

/**
 * A NOTAM's badge next to what it addresses, Material's Badge with its
 * word: red (the error roles) where the thing is closed or not to be
 * used, the caution's colours where it is still open (the owner,
 * 2026-11-11: "If runway is not closed, the notam badge can be caution
 * color"). TalkBack reads the NOTAM's words after the badge's.
 */
@Composable
fun NotamBadge(mark: NotamMark, modifier: Modifier = Modifier) {
    val palette = LocalWingtipPalette.current
    val said = stringResource(R.string.notam_badge_said, mark.word, mark.label)
    Badge(
        containerColor = if (mark.unusable) MaterialTheme.colorScheme.error else palette.cautionWash,
        contentColor = if (mark.unusable) MaterialTheme.colorScheme.onError else palette.cautionInk,
        modifier = modifier.semantics { contentDescription = said },
    ) { Text(mark.word) }
}

/** A badge that is its own tap, for a row whose own tap does something
 *  else (a frequency's copy) or a line with no row (the field's): the
 *  stock text button round it, which gives it Material's 48 dp target. */
@Composable
fun NotamBadgeButton(mark: NotamMark, onOpen: (NotamMark) -> Unit, modifier: Modifier = Modifier) {
    TextButton(onClick = { onOpen(mark) }, modifier = modifier) { NotamBadge(mark) }
}
