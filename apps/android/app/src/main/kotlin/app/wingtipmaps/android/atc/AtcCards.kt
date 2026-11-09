package app.wingtipmaps.android.atc

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.altitudeSaid
import app.wingtipmaps.android.engine.generated.atcCall
import app.wingtipmaps.android.engine.generated.readbackCheck
import app.wingtipmaps.android.format.Format

/** A call to us and what became of it (the web's AtcCard). */
data class AtcCard(
    /** The transmission's id (RadioListener). */
    val id: Int,
    val text: String,
    /** When it was heard, ms since 1970. */
    val atMs: Long,
    val items: List<AtcItem>,
    /** The pilot's readback and how it matched, once heard. */
    val readback: Readback? = null,
    /** Read Back was tapped: the next transmission heard is it. */
    val awaiting: Boolean = false,
    /** Put away by the pilot. */
    val dismissed: Boolean = false,
    /** The items set with a tap, by their place in `items`. */
    val set: Set<Int> = emptySet(),
) {
    data class Readback(val said: String, val check: EngineContract.ReadbackCheckAnswer)
}

/** One transmission the radio settled on (RadioListener's). */
data class Heard(val id: Int, val text: String, val atMs: Long, val final: Boolean)

/** The engine's rules the copilot asks: atc_call, readback_check and
 *  altitude_said; a fake in the tests, which have no engine. */
interface AtcRules {
    fun call(text: String, tail: String?, prior: EngineContract.AtcCallInputPrior?): EngineContract.AtcCallAnswer?
    fun readback(cleared: String, said: String, tail: String?): EngineContract.ReadbackCheckAnswer?
    fun altitude(ft: Double): String
}

object EngineAtc : AtcRules {
    /** A call the engine could not read makes no card (Engine.rule logs
     *  why): nothing is shown rather than something wrong. */
    override fun call(text: String, tail: String?, prior: EngineContract.AtcCallInputPrior?) = Engine.atcCall(text, tail, prior).getOrNull()

    override fun readback(cleared: String, said: String, tail: String?) = Engine.readbackCheck(cleared, said, tail).getOrNull()

    override fun altitude(ft: Double): String = Engine.altitudeSaid(ft).getOrNull() ?: Format.altitude(ft)
}

/**
 * The copilot's cards from what the radio says, one settled transmission
 * at a time (the web's atcCards, the iPhone's AtcCopilot.heardInto): a
 * call to us makes a card with its items; our own transmission after it,
 * or the next after Read Back, is that card's readback, checked by the
 * engine. Who said what is the engine's; this keeps the cards. Pure, so
 * the JVM tests run it over fakes.
 */
object AtcCards {
    /** As many calls as are kept, newest first: the card shows the newest. */
    const val KEPT = 4

    /** How long after a call our own transmission is still its readback,
     *  ms; past that it answers something else (the web's
     *  READBACK_WINDOW_MS). */
    const val READBACK_WINDOW_MS = 60_000L

    fun heardInto(cards: List<AtcCard>, heard: Heard, tail: String?, rules: AtcRules): List<AtcCard> {
        val latest = cards.firstOrNull()
        val open = latest?.takeIf { it.readback == null && heard.atMs - it.atMs <= READBACK_WINDOW_MS }
        val prior = open?.let { EngineContract.AtcCallInputPrior(it.text, (heard.atMs - it.atMs) / 1000.0) }
        val answer = rules.call(heard.text, tail, prior) ?: return cards
        if (answer.who == "to_us") {
            return (listOf(AtcCard(heard.id, heard.text, heard.atMs, AtcItem.items(answer.items))) + cards).take(KEPT)
        }
        if (open != null && (answer.who == "from_us" || open.awaiting)) return listOf(readBack(open, heard.text, tail, rules)) + cards.drop(1)
        return cards
    }

    /** The card with `said` as its readback, checked. */
    fun readBack(card: AtcCard, said: String, tail: String?, rules: AtcRules): AtcCard {
        val check = rules.readback(card.text, said, tail) ?: return card.copy(awaiting = false)
        return card.copy(awaiting = false, readback = AtcCard.Readback(said, check))
    }

    /** The card shown: the newest, unless put away. */
    fun shown(cards: List<AtcCard>): AtcCard? = cards.firstOrNull()?.takeIf { !it.dismissed }
}
