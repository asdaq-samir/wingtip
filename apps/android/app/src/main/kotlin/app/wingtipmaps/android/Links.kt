package app.wingtipmaps.android

import app.wingtipmaps.android.navigation.generated.LinkKey
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.share.SharedPlan
import java.net.URI
import java.net.URLDecoder

/**
 * The site's links the app opens in place of Chrome (App Links, the
 * manifest): the sign-in link emailed to the pilot, and the web app's own
 * address for a route or a field (`/app/plan?dep=&dest=&stops=`,
 * `?place=`), and one of the app's screens by its name (`?open=logbook`,
 * design/screens.json; the same from the app's own
 * `wingtipmaps://plan?open=logbook`). Read with the JVM's own URI, not Android's, so a unit test
 * reads them too.
 */
object Links {
    sealed interface Link

    /** The sign-in link's one-time token (Session.open). */
    data class SignIn(val token: String) : Link

    /** A route to plan, its idents as the planner reads them, and the
     *  screen the link names beside it, opened once it is in. */
    data class Route(val dep: String, val dest: String, val stops: List<String>, val then: Screen? = null) : Link

    /** One of the app's screens by its name. */
    data class Open(val screen: Screen) : Link

    /** A field's card to open. */
    data class Place(val ident: String) : Link

    /** A flight another pilot sent (`open=shared`): its plan in the link,
     *  or a saved flight's share token to read it by. Previewed first,
     *  never planned by itself over the receiver's own plan. */
    data class Shared(val plan: SharedPlan?, val token: String?) : Link

    /**
     * `url` read, a sign-in link only as `https` on `host`, the app's own
     * (the verified App Link's): any app can send MainActivity a link, and
     * one carrying another account's token on another host, or on the
     * app's own scheme, would sign the pilot in to it (the security
     * audit's M1, 2026-11-10). Even then it is asked first (Session.open).
     */
    fun parse(url: String?, host: String = Config.host): Link? {
        if (url.isNullOrBlank()) return null
        val uri = runCatching { URI(url) }.getOrNull() ?: return null
        val query = query(uri.rawQuery)
        val screen = Screen.of(query[Screen.LINK_KEY]?.lowercase())
        if (uri.scheme == Screen.SCHEME) return if (uri.host == Screen.SCHEME_HOST) planner(query, screen) else null
        val path = uri.path ?: return null
        if (path.endsWith("/api/auth/magic-link/verify")) {
            if (uri.scheme != "https" || !uri.rawAuthority.equals(host, ignoreCase = true) || path != "/api/auth/magic-link/verify") return null
            return query["token"]?.takeIf { it.isNotEmpty() }?.let { SignIn(it) }
        }
        if (path != Screen.LINK_PATH && !path.startsWith("${Screen.LINK_PATH}/")) return null
        return planner(query, screen)
    }

    /** The planner's address read: a route, a field, or a screen alone. */
    private fun planner(
        query: Map<String, String>,
        screen: Screen?,
    ): Link? {
        // A shared flight before the route: its keys are a route's, but it
        // is shown first and planned only at Use This Plan.
        if (screen == Screen.SHARED) {
            val token = query[LinkKey.SHARE.key]?.trim()?.takeIf { it.isNotEmpty() && it.length <= 32 }
            if (token != null) return Shared(null, token)
            return SharedPlan.of(query)?.let { Shared(it, null) }
        }
        val dep = ident(query["dep"])
        val dest = ident(query["dest"])
        // A route is the address's main thing: with both ends it is
        // planned; a field alone opens its card.
        if (dep.isNotEmpty() && dest.isNotEmpty()) {
            val stops = query["stops"].orEmpty().split(",").map { ident(it) }.filter { it.isNotEmpty() }
            return Route(dep, dest, stops, screen)
        }
        val place = ident(query["place"])
        return if (place.isNotEmpty()) Place(place) else screen?.let { Open(it) }
    }

    private fun ident(text: String?): String = text.orEmpty().trim().uppercase()

    private fun query(raw: String?): Map<String, String> =
        raw.orEmpty().split("&").filter { it.isNotEmpty() }.associate { part ->
            val at = part.indexOf('=')
            val name = if (at < 0) part else part.substring(0, at)
            val value = if (at < 0) "" else part.substring(at + 1)
            URLDecoder.decode(name, "UTF-8") to URLDecoder.decode(value, "UTF-8")
        }
}
