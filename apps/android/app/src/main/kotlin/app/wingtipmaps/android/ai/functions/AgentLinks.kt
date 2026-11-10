package app.wingtipmaps.android.ai.functions

import app.wingtipmaps.android.navigation.generated.LinkKey
import app.wingtipmaps.android.navigation.generated.Screen
import java.net.URLEncoder

/**
 * The app's own links for what an agent opens (wingtipmaps://plan?…,
 * design/screens.json): the same addresses Links reads for a link tapped
 * anywhere else, so an agent's "plan KPAO to KSQL" lands where a shared
 * route does. Pure, for a unit test.
 */
object AgentLinks {
    private const val BASE = "${Screen.SCHEME}://${Screen.SCHEME_HOST}"

    fun screen(screen: Screen): String = "$BASE?${Screen.LINK_KEY}=${screen.id}"

    fun place(ident: String): String = "$BASE?${LinkKey.PLACE.key}=${enc(ident)}"

    fun route(dep: String, dest: String, stops: List<String>): String {
        val parts = mutableListOf("${LinkKey.DEP.key}=${enc(dep)}", "${LinkKey.DEST.key}=${enc(dest)}")
        if (stops.isNotEmpty()) parts += "${LinkKey.STOPS.key}=${enc(stops.joinToString(","))}"
        return "$BASE?${parts.joinToString("&")}"
    }

    private fun enc(text: String): String = URLEncoder.encode(text, "UTF-8")
}
