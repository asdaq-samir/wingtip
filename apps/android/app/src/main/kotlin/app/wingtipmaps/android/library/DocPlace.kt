package app.wingtipmaps.android.library

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.navigation.generated.Screen
import kotlinx.serialization.Serializable
import java.net.URLEncoder

/**
 * A document open in the reader, as the web's address writes its `doc`
 * key (apps/web/src/features/documents/docPlace.ts), so a cite tapped, a
 * library row, a bookmark and a shared link are one place on every app:
 * the library's document by the name the engine's citations give it
 * ("cfr-14-91", "aim", "phak") or a pilot's own PDF ("own:<id>"), and
 * after an @ where in it, a CFR section or an AIM paragraph ("91.155",
 * "7-1-5") or a page ("p12").
 */
@Serializable
data class DocPlace(val doc: String, val at: String? = null, val page: Int? = null) {
    /** The place as the address writes it: "aim@7-1-5", "phak@p42". */
    val text: String get() = when {
        page != null -> "$doc@p$page"
        at != null -> "$doc@$at"
        else -> doc
    }

    /** A pilot's own document, which lives on this phone alone. */
    val isOwn: Boolean get() = doc.startsWith(OWN)

    /** The link that opens this place on any device, the web's address
     *  with its `doc`; none for the pilot's own, which is on this phone
     *  alone. */
    fun link(origin: String = Config.gateway): String? =
        if (isOwn) null else "$origin${Screen.LINK_PATH}?doc=${URLEncoder.encode(text, "UTF-8")}"

    companion object {
        const val OWN = "own:"

        // What a name and a place may be written with: letters, figures
        // and a section's marks, nothing to read as a path.
        private val NAME = Regex("^(own:)?[a-z0-9][a-z0-9.-]{0,63}$", RegexOption.IGNORE_CASE)
        private val AT = Regex("^[A-Za-z0-9.()-]{1,32}$")
        private val PAGE = Regex("^p(\\d{1,5})$")

        /** The address's `doc` read; anything else none. */
        fun parse(value: String?): DocPlace? {
            if (value == null) return null
            val doc = value.substringBefore('@')
            if (!NAME.matches(doc)) return null
            if ('@' !in value) return DocPlace(doc)
            val where = value.substringAfter('@')
            PAGE.matchEntire(where)?.let { return DocPlace(doc, page = maxOf(1, it.groupValues[1].toInt())) }
            return if (AT.matches(where)) DocPlace(doc, at = where) else DocPlace(doc)
        }

        fun own(id: String) = DocPlace(OWN + id)
    }
}
