package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto

/**
 * An airplane's category, class and gear as the gateway keeps them on a
 * logbook entry ("airplane", "single-engine land", a tailwheel or not),
 * which passenger currency is judged in (14 CFR 61.57(a)(1)(i)-(ii)). The
 * phone knows them only where the pilot's logbook has said them for the
 * same N-number, the same airplane; else none, which the engine counts
 * toward no passenger currency and says it can't tell (the gateway's
 * dayPassengersUnknown), never guessed from a type. Pure, for a unit test.
 */
data class AirplaneKind(val category: String?, val aircraftClass: String?, val tailwheel: Boolean?) {
    companion object {
        /** The airplane `tail`'s, each column from the pilot's newest entry
         *  of that N-number that says it; null where none says any. */
        fun of(entries: List<LogbookEntryDto>, tail: String?): AirplaneKind? {
            val n = tail?.trim()?.ifEmpty { null } ?: return null
            val its = entries.filter { it.aircraft?.trim().equals(n, ignoreCase = true) }.sortedByDescending { it.flownOn }
            val kind = AirplaneKind(
                category = its.firstNotNullOfOrNull { it.category },
                aircraftClass = its.firstNotNullOfOrNull { it.aircraftClass },
                tailwheel = its.firstNotNullOfOrNull { it.tailwheel },
            )
            return kind.takeIf { it.category != null || it.aircraftClass != null || it.tailwheel != null }
        }
    }
}
