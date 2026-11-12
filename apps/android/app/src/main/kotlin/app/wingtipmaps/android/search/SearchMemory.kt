package app.wingtipmaps.android.search

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.api.Gateway
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

/** A field or an airplane the search remembers: by its ident (an
 *  airplane's N-number, else its type) and the name it showed. */
@Serializable
data class Remembered(val kind: Kind, val ident: String, val name: String = "", val type: String? = null) {
    enum class Kind { AIRPORT, AIRPLANE }
}

/**
 * What the one search shows with nothing typed, kept on this phone: the
 * fields the pilot starred on their cards (Favorites; the pilot's own
 * airplanes join them from OwnAirplanes), and the fields and airplanes
 * last picked from it (Recents), the newest first. Nothing is sent
 * anywhere. One instance a process, so every screen sees a star the
 * moment it is set.
 */
class SearchMemory(private val read: (String) -> String?, private val write: (String, String) -> Unit) {
    private val _favorites = MutableStateFlow(load(FAVORITES))
    val favorites: StateFlow<List<Remembered>> = _favorites.asStateFlow()

    private val _recents = MutableStateFlow(load(RECENTS))
    val recents: StateFlow<List<Remembered>> = _recents.asStateFlow()

    fun picked(entry: Remembered) {
        _recents.value = remembered(_recents.value, entry)
        save(RECENTS, _recents.value)
    }

    fun toggleFavorite(entry: Remembered) {
        _favorites.value = toggled(_favorites.value, entry)
        save(FAVORITES, _favorites.value)
    }

    fun isFavorite(ident: String): Boolean = _favorites.value.any { it.ident.equals(ident, ignoreCase = true) }

    private fun load(key: String): List<Remembered> =
        read(key)?.let { runCatching { Gateway.json.decodeFromString(LIST, it) }.getOrNull() }.orEmpty()

    private fun save(key: String, list: List<Remembered>) = write(key, Gateway.json.encodeToString(LIST, list))

    companion object {
        /** The recents kept: what fits the sheet at half without a scroll. */
        const val MAX_RECENTS = 8
        private const val FAVORITES = "favorites"
        private const val RECENTS = "recents"
        private val LIST = ListSerializer(Remembered.serializer())

        @Volatile
        private var shared: SearchMemory? = null

        fun of(context: Context): SearchMemory = shared ?: synchronized(this) {
            shared ?: run {
                val prefs = Kept.of(context, "search")
                SearchMemory({ prefs[stringPreferencesKey(it)] }, { k, v -> prefs.edit { it[stringPreferencesKey(k)] = v } })
            }.also { shared = it }
        }

        /** `entry` first, any earlier pick of the same thing taken out, the
         *  oldest let go past MAX_RECENTS. */
        fun remembered(recents: List<Remembered>, entry: Remembered): List<Remembered> =
            (listOf(entry) + recents.filterNot { it.kind == entry.kind && it.ident.equals(entry.ident, ignoreCase = true) }).take(MAX_RECENTS)

        /** `entry` starred at the end, or taken out where it was starred. */
        fun toggled(favorites: List<Remembered>, entry: Remembered): List<Remembered> {
            val had = favorites.any { it.kind == entry.kind && it.ident.equals(entry.ident, ignoreCase = true) }
            return if (had) favorites.filterNot { it.kind == entry.kind && it.ident.equals(entry.ident, ignoreCase = true) } else favorites + entry
        }
    }
}
