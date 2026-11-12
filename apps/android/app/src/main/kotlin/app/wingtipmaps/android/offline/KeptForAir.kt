package app.wingtipmaps.android.offline

import android.content.Context
import app.wingtipmaps.android.AppClock
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/**
 * The last good answer of each thing a flight needs in the air, kept on
 * the phone with when the network gave it: the Brief's Go / No-Go, the
 * route's airport cards (their METAR and TAF, frequencies and runways)
 * and diagrams, the ranked NOTAMs and each field's own, the route's side
 * view and the weather loop's frames (the plan
 * and its nav log are KeptPlan's). A screen's model writes one as it
 * comes and reads it back when the network fails, said with its age
 * (KeptAgeLine); Keep for the Air fetches them all for the route at once
 * (KeepForAir).
 *
 * One file per answer under the app's own files (not its cache, which
 * the system empties when space is short): what is kept stays on this
 * phone and goes nowhere. All of it is public aviation data, the FAA's
 * and the weather service's, so signing out leaves it (the owner's
 * privacy texts: sign-out clears the pilot's own records).
 */
class KeptForAir(private val dir: File) {
    /** An answer as the planner sent it, and when (epoch milliseconds). */
    @Serializable
    data class Entry(val kind: String, val key: String, val fetchedAtMs: Long, val body: String)

    /** An answer had: from the network now, or the kept one. */
    data class Had<T>(val value: T, val fetchedAtMs: Long, val kept: Boolean)

    private fun file(kind: String, key: String, ext: String): File = File(File(dir, kind), "${safe(key)}.$ext")

    fun write(kind: String, key: String, body: String, atMs: Long = AppClock.nowMs()) {
        val to = file(kind, key, "json")
        runCatching {
            to.parentFile?.mkdirs()
            // Written beside and moved over, so a kill mid-write leaves the
            // last good answer, never half of one.
            val part = File(to.path + ".part")
            part.writeText(JSON.encodeToString(Entry.serializer(), Entry(kind, key, atMs, body)))
            if (!part.renameTo(to)) part.delete()
        }
    }

    fun read(kind: String, key: String): Entry? =
        file(kind, key, "json").takeIf { it.isFile }?.let { f -> runCatching { JSON.decodeFromString(Entry.serializer(), f.readText()) }.getOrNull() }

    /** A file kept whole, a diagram's PDF: where it is, whether or not it
     *  is there yet. */
    fun pdf(kind: String, url: String): File = file(kind, url, "pdf")

    /** What the answers named take on the phone, bytes. */
    fun bytes(kind: String, keys: Collection<String>): Long =
        keys.sumOf { k -> file(kind, k, "json").length() + file(kind, k, "pdf").length() }

    /** Everything kept, gone. */
    fun clear() {
        dir.deleteRecursively()
    }

    /** The answer from the network, kept as it comes; where the network
     *  fails, the kept one with its time; where there is none, the failure. */
    suspend fun <T> orKept(kind: String, key: String, serializer: KSerializer<T>, nowMs: Long = AppClock.nowMs(), fetch: suspend () -> T): Had<T> {
        try {
            val value = fetch()
            write(kind, key, JSON.encodeToString(serializer, value), nowMs)
            return Had(value, nowMs, kept = false)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val kept = read(kind, key) ?: throw e
            val value = runCatching { JSON.decodeFromString(serializer, kept.body) }.getOrNull() ?: throw e
            return Had(value, kept.fetchedAtMs, kept = true)
        }
    }

    companion object {
        /** The kinds, as the engine's kept_age and ready_to_fly name them. */
        const val GO_NO_GO = "go_no_go"
        const val AIRPORTS = "airports"
        const val WEATHER = "weather"
        const val NOTAMS = "notams"
        const val PLAN = "plan"
        const val WEATHER_LOOP = "weather_loop"

        /** The route's side view (/api/route-profile): the ground and the
         *  obstacles under it, a cycle's data, so said with no age. Not one
         *  of the engine's kinds: ready_to_fly does not count it. */
        const val ROUTE_PROFILE = "route_profile"

        /** The key a field's own NOTAMs are kept under, the one the airport
         *  card reads (AirportModel) and Keep for the Air writes. */
        fun fieldNotams(ident: String): String = "$ident|field"

        /** The planner's own coder's settings: a member not modelled is
         *  passed over, so an answer kept by an older build still reads. */
        val JSON = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }

        /** A key as a file's name: its letters kept, the rest made safe,
         *  and its hash so two keys never share one. */
        fun safe(key: String): String =
            key.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80) + "-" + Integer.toHexString(key.hashCode())

        @Volatile
        private var shared: KeptForAir? = null

        /** The app's store, made at the first ask; none in a JVM test
         *  that has not given one, where nothing is kept. */
        val current: KeptForAir? get() = shared

        fun of(context: Context): KeptForAir =
            shared ?: synchronized(this) { shared ?: KeptForAir(File(context.applicationContext.filesDir, "kept-air")).also { shared = it } }

        /** For tests: the store at a folder of their own. */
        fun use(store: KeptForAir?) {
            shared = store
        }

        /** The answer through the app's store where there is one, else
         *  straight from the network. */
        suspend fun <T> had(kind: String, key: String, serializer: KSerializer<T>, fetch: suspend () -> T): Had<T> =
            current?.orKept(kind, key, serializer, fetch = fetch) ?: Had(fetch(), AppClock.nowMs(), kept = false)
    }
}
