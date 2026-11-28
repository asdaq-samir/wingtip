package app.wingtipmaps.android

import app.wingtipmaps.android.library.DocPlace
import app.wingtipmaps.android.navigation.generated.LinkKey
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.share.SharedPlan
import java.net.URI
import java.net.URLDecoder

/**
 * The site's links the app opens in place of Chrome (App Links, the
 * manifest): the sign-in link emailed to the pilot, and the web app's own
 * address for a route (previewed first) or a field (`/app/plan?dep=&dest=&stops=`,
 * `?place=`), and one of the app's screens by its name (`?open=logbook`,
 * design/screens.json; the same from the app's own
 * `wingtipmaps://plan?open=logbook`). Read with the JVM's own URI, not Android's, so a unit test
 * reads them too.
 */
object Links {
    sealed interface Link

    /** The sign-in link's one-time token (Session.open). */
    data class SignIn(val token: String) : Link

    /** One of the app's screens by its name. */
    data class Open(val screen: Screen) : Link

    /** A field's card to open. */
    data class Place(val ident: String) : Link

    /** A document of the library at its place (`?doc=aim@7-1-5`, the
     *  web's address key; library/DocPlace), or a PDF the pilot just
     *  shared in, by its own name. */
    data class Doc(val place: String) : Link

    /** A flight another pilot sent (`open=shared`), or any route link
     *  (`dep=&dest=`): its plan in the link, or a saved flight's share
     *  token to read it by. Previewed first, never planned by itself over
     *  the receiver's own plan. */
    data class Shared(val plan: SharedPlan?, val token: String?) : Link

    /**
     * `url` read, a sign-in link only as `https` on `host`, the app's own
     * (the verified App Link's): any app can send MainActivity a link, and
     * one carrying another account's token on another host, or on the
     * app's own scheme, would sign the pilot in to it. Even then it is asked first (Session.open).
     */
    fun parse(url: String?, host: String = Config.host): Link? {
        if (url.isNullOrBlank()) return null
        // The address read without its query, which is read part by part
        // below: java.net.URI refuses a whole link for one bad escape in
        // it ("%E0%A4%A"), where a bad part is only to be left out.
        val (address, rawQuery) = url.substringBefore('#').let { it.substringBefore('?') to it.substringAfter('?', "") }
        val uri = runCatching { URI(address) }.getOrNull() ?: return null
        val query = query(rawQuery)
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

    /** The planner's address read: a shared route, a field, or a screen alone. */
    private fun planner(
        query: Map<String, String>,
        screen: Screen?,
    ): Link? {
        // A shared flight, and any route link with both ends: any page or
        // app can open one, so it is previewed as a shared flight is and
        // replaces the pilot's plan only at Use This Plan. A screen named beside a
        // route is not opened over the preview.
        if (screen == Screen.SHARED) {
            val token = query[LinkKey.SHARE.key]?.trim()?.takeIf { it.isNotEmpty() && it.length <= 32 }
            if (token != null) return Shared(null, token)
        }
        DocPlace.parse(query["doc"])?.let { return Doc(it.text) }
        SharedPlan.of(query)?.let { return Shared(it, null) }
        if (screen == Screen.SHARED) return null
        val place = ident(query["place"])
        return if (place.isNotEmpty()) Place(place) else screen?.let { Open(it) }
    }

    private fun ident(text: String?): String = text.orEmpty().trim().uppercase()

    // A part whose escapes are bad ("%", "%zz") is left out: URLDecoder
    // throws on one, and any page or app can hand MainActivity such a link,
    // which closed the app, moving map and all, mid-flight. The iPhone's URLComponents never threw.
    private fun query(raw: String?): Map<String, String> =
        raw.orEmpty().split("&").filter { it.isNotEmpty() }.mapNotNull { part ->
            val at = part.indexOf('=')
            val name = if (at < 0) part else part.substring(0, at)
            val value = if (at < 0) "" else part.substring(at + 1)
            runCatching { URLDecoder.decode(name, "UTF-8") to URLDecoder.decode(value, "UTF-8") }.getOrNull()
        }.toMap()
}
