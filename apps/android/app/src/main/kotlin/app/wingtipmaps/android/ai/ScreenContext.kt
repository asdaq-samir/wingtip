package app.wingtipmaps.android.ai

import android.app.assist.AssistContent
import android.net.Uri
import androidx.core.net.toUri
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.navigation.generated.LinkKey
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.KeptPlan
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * What is on the screen, for Gemini's "ask about this screen" and the
 * system's other assistants (Android's Assist API, AssistContent: the
 * twin of iOS's View Annotations; docs/android-ai.md): the route on the
 * page as the web app's own link, which opens it anywhere, and as
 * schema.org JSON-LD, a Trip by way of its airports. Nothing is shared
 * until the pilot asks the assistant about the screen.
 */
object ScreenContext {
    /** The route's link on the site (`/app/plan?dep=&dest=&stops=`). */
    fun link(route: KeptPlan.Kept): String {
        val builder = Uri.Builder().scheme("https").authority(Config.host).path(Screen.LINK_PATH)
            .appendQueryParameter(LinkKey.DEP.key, route.dep).appendQueryParameter(LinkKey.DEST.key, route.dest)
        if (route.stops.isNotEmpty()) builder.appendQueryParameter(LinkKey.STOPS.key, route.stops.joinToString(","))
        return builder.build().toString()
    }

    /** The route as schema.org JSON-LD: a Trip whose itinerary is its airports in order. */
    fun jsonLd(route: KeptPlan.Kept, link: String): String {
        val points = (listOf(route.dep) + route.stops + route.dest).map { ident ->
            JsonObject(mapOf("@type" to JsonPrimitive("Airport"), "icaoCode" to JsonPrimitive(ident)))
        }
        val trip = mutableMapOf(
            "@context" to JsonPrimitive("https://schema.org"),
            "@type" to JsonPrimitive("Trip"),
            "name" to JsonPrimitive("Flight ${(listOf(route.dep) + route.stops + route.dest).joinToString(" ")}"),
            "url" to JsonPrimitive(link),
            "itinerary" to JsonArray(points),
        )
        if (route.aircraft.isNotEmpty()) trip["description"] = JsonPrimitive("In ${route.aircraft}")
        return JsonObject(trip).toString()
    }

    /** The route on the page put in the assistant's content; nothing where none is planned. */
    fun fill(out: AssistContent, route: KeptPlan.Kept?) {
        if (route == null || route.dep.isEmpty() || route.dest.isEmpty()) return
        val link = link(route)
        out.webUri = link.toUri()
        out.structuredData = jsonLd(route, link)
    }
}
