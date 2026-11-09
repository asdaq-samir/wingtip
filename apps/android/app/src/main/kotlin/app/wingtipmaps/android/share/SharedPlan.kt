package app.wingtipmaps.android.share

import app.wingtipmaps.android.navigation.generated.LinkKey
import app.wingtipmaps.android.navigation.generated.Screen
import java.net.URLEncoder

/**
 * A flight's plan as a shared link carries it (design/screens.json, the
 * `shared` screen and its keys): the route, its cruise altitude, when it
 * leaves, the airplane's type and the flight rules, and the N-number only
 * where the sender chose to send it. The same link the web and the iPhone
 * write, `https://<host>/app/plan?open=shared&dep=…`, so a link sent from
 * one opens on the others. Plain Kotlin, so a unit test reads and writes it.
 */
data class SharedPlan(
    val dep: String,
    val dest: String,
    val stops: List<String> = emptyList(),
    /** Feet MSL; null for the planner's own pick. */
    val altitudeFt: Int? = null,
    /** An ISO 8601 instant; null for about now. */
    val depart: String? = null,
    /** The airplane's type designator, shown and never assumed: the
     *  receiver plans with their own airplane. */
    val type: String? = null,
    /** "vfr" or "ifr". */
    val rules: String? = null,
    val tail: String? = null,
) {
    /** The link to send, at the site's address (`origin`, no trailing
     *  slash); a key with nothing in it is left out. */
    fun link(origin: String): String {
        val keys = listOfNotNull(
            Screen.LINK_KEY to Screen.SHARED.id,
            LinkKey.DEP.key to dep,
            LinkKey.DEST.key to dest,
            stops.takeIf { it.isNotEmpty() }?.let { LinkKey.STOPS.key to it.joinToString(",") },
            altitudeFt?.let { LinkKey.ALTITUDE_FT.key to it.toString() },
            depart?.let { LinkKey.DEPART.key to it },
            type?.let { LinkKey.TYPE.key to it },
            rules?.let { LinkKey.RULES.key to it },
            tail?.let { LinkKey.TAIL.key to it },
        )
        val query = keys.joinToString("&") { (k, v) -> "$k=${URLEncoder.encode(v, "UTF-8").replace("%2C", ",")}" }
        return "$origin${Screen.LINK_PATH}?$query"
    }

    companion object {
        /** A shared link's plan from its keys; null without both ends. */
        fun of(query: Map<String, String>): SharedPlan? {
            val dep = ident(query[LinkKey.DEP.key])
            val dest = ident(query[LinkKey.DEST.key])
            if (dep == null || dest == null) return null
            return SharedPlan(
                dep = dep,
                dest = dest,
                stops = query[LinkKey.STOPS.key].orEmpty().split(",").mapNotNull { ident(it) },
                altitudeFt = query[LinkKey.ALTITUDE_FT.key]?.trim()?.toIntOrNull()?.takeIf { it in 0..60_000 },
                depart = query[LinkKey.DEPART.key]?.trim()?.takeIf { runCatching { java.time.Instant.parse(it) }.isSuccess },
                type = ident(query[LinkKey.TYPE.key]),
                rules = query[LinkKey.RULES.key]?.trim()?.lowercase()?.takeIf { it == "vfr" || it == "ifr" },
                tail = ident(query[LinkKey.TAIL.key]),
            )
        }

        /** An ident as the planner takes one: letters and figures, upper case. */
        private fun ident(raw: String?): String? =
            raw?.trim()?.uppercase()?.takeIf { it.isNotEmpty() && it.length <= 8 && it.all(Char::isLetterOrDigit) }
    }
}
