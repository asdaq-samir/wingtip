package app.wingtipmaps.android.library

import app.wingtipmaps.android.api.generated.LibraryDocument
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.citations

/** A piece of words, and the place it opens where it is a cite. */
data class CitedPiece(val text: String, val place: DocPlace?)

object Citations {
    /**
     * `text` cut into pieces by the engine's `citations` (wingtip-wording's
     * cite.rs), each cite a place in the library where the shelf holds its
     * document in an edition, else words: where a rule lives is the
     * engine's to say, never a screen's copy. The engine's failure leaves
     * the words whole.
     */
    fun pieces(text: String, shelf: List<LibraryDocument>): List<CitedPiece> {
        // TODO(claude/documents): Engine.citations is written by
        // scripts/build/engine-contract-apps.sh once the engine's contract
        // has the rule (cargo run -p wingtip-contract-gen), the integrator's.
        val answer = Engine.citations(text = text).getOrNull() ?: return listOf(CitedPiece(text, null))
        return answer.pieces.map { p ->
            val cite = p.cite
            val held = cite != null && shelf.any { it.id == cite.doc && it.edition != null }
            CitedPiece(p.text, if (held) DocPlace(cite.doc, at = cite.at) else null)
        }
    }
}
