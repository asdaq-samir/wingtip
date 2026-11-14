package app.wingtipmaps.android.search

import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.plan.FlightChoices

/**
 * What a pick does while the one search was opened by an Add
 * (SearchControl.keep; the web's useSearchPanel pickAirplane, 2026-11-14):
 * kept, never opened. Your airplane's Add makes it the airplane flown (its
 * N-number the plan's, a stock type the plan's airplane, as the plan's
 * own airplane field does); a Favorite's Add stars it. A pick of the
 * wrong kind, or an airplane heard with no registration to keep it by,
 * is not kept: it is the caller's to open.
 */
object KeepPick {
    /** The N-number or the type a pick is kept by; null where there is none. */
    fun keyOf(picked: SearchPick): Remembered? = when (picked) {
        is SearchPick.Airplane -> Remembered(Remembered.Kind.AIRPLANE, picked.tail ?: picked.name, type = picked.type)
        is SearchPick.Traffic -> picked.registration?.let(SearchGroups::compact)?.takeIf(SearchGroups::looksLikeTail)
            ?.let { Remembered(Remembered.Kind.AIRPLANE, it) }
        is SearchPick.Airport -> Remembered(Remembered.Kind.AIRPORT, picked.ident, picked.name, closed = picked.closed)
        else -> null
    }

    /** Keeps `picked` as `what` asks; whether it was kept. */
    fun keep(picked: SearchPick, what: SearchControl.Keep, memory: SearchMemory, choices: FlightChoices): Boolean {
        val key = keyOf(picked) ?: return false
        val airplane = key.kind == Remembered.Kind.AIRPLANE
        when (what) {
            SearchControl.Keep.Mine -> {
                if (!airplane) return false
                val tail = key.ident.takeIf(SearchGroups::looksLikeTail)
                if (tail != null) choices.setTail(tail) else ProfileOpen.open(null, type = key.type ?: key.ident)
            }
            SearchControl.Keep.Airplane, SearchControl.Keep.Airport -> {
                if (airplane != (what == SearchControl.Keep.Airplane)) return false
                if (memory.favorites.value.none { it.kind == key.kind && it.ident.equals(key.ident, ignoreCase = true) }) memory.toggleFavorite(key)
            }
        }
        return true
    }
}
