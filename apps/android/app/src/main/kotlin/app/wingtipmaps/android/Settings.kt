package app.wingtipmaps.android

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.SharedPreferencesMigration
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import androidx.datastore.preferences.preferencesDataStoreFile
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** The app's settings file (Jetpack DataStore), for the switches the map
 *  and the flight pieces keep: traffic (Traffic's TrafficSwitch) and what
 *  the map draws (map/MapLayers). One delegate for the file, as DataStore
 *  allows one store a file in a process. */
val Context.settings: DataStore<Preferences> by preferencesDataStore(name = "settings")

/**
 * What the app keeps that was a SharedPreferences file, now a Jetpack
 * DataStore of the same name, each moved over once by DataStore's own
 * SharedPreferencesMigration (which deletes the old file after), so a
 * pilot's saved settings, plan, cookies and lists survive the update.
 *
 * For the pieces that read at once (a theme on the first frame, the
 * cookie jar OkHttp asks on its own thread), the values are held in
 * memory as DataStore's guide has it for synchronous code ("Use DataStore
 * in synchronous code"): read from the file once, on first use, as
 * SharedPreferences read its file; then each change is made to the copy
 * at once and written by DataStore in order behind it, as
 * SharedPreferences' apply() did. This process is the files' only writer,
 * so the copy is the truth.
 */
class Kept internal constructor(private val store: DataStore<Preferences>) {
    private val values: MutableStateFlow<Preferences> by lazy {
        MutableStateFlow(runBlocking(Dispatchers.IO) { store.data.first() })
    }

    /** Every value kept, as it changes. */
    val all: StateFlow<Preferences> get() = values.asStateFlow()

    operator fun <T> get(key: Preferences.Key<T>): T? = values.value[key]

    operator fun contains(key: Preferences.Key<*>): Boolean = key in values.value

    /** A change made now and written behind; the same change is applied
     *  to the file, so it must only put, remove and clear. */
    fun edit(change: (MutablePreferences) -> Unit) {
        values.update { it.toMutablePreferences().apply(change) }
        writer.launch { store.edit(change) }
    }

    companion object {
        /** One writer, in order, on the IO dispatcher: a change made after
         *  another is written after it, the app's own files (KeptFile)
         *  among them. */
        val writing: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1)
        private val writer = CoroutineScope(SupervisorJob() + writing)
        private val files = ConcurrentHashMap<String, Kept>()

        /** The store that was the SharedPreferences file `name`; one per
         *  file in the process, as DataStore requires. */
        fun of(context: Context, name: String): Kept {
            val app = context.applicationContext
            return files.computeIfAbsent(name) {
                Kept(
                    PreferenceDataStoreFactory.create(
                        migrations = listOf(SharedPreferencesMigration(app, name)),
                        produceFile = { app.preferencesDataStoreFile(name) },
                    ),
                )
            }
        }
    }
}

/**
 * A file of the app's own that is not a setting (the flight recorded, the
 * path flown): read once where it is made, then written behind on the
 * settings' one IO writer (Kept.writing), in order, each write whole or
 * not at all (beside the file, then renamed over it). So a fix taken on
 * the main thread never waits on the JSON or the disk. A test hands in
 * Dispatchers.Unconfined, to write at once.
 */
class KeptFile(private val file: File, private val writing: CoroutineDispatcher = Kept.writing) {
    private val writer = CoroutineScope(SupervisorJob() + writing)

    /** What the file holds; null where there is none or it cannot be read. */
    fun read(): String? = runCatching { file.readText() }.getOrNull()

    /** `text` made and written behind, after every write asked before it. */
    fun write(text: () -> String) {
        writer.launch {
            val _ = runCatching {
                file.parentFile?.mkdirs()
                val part = File(file.path + ".part")
                part.writeText(text())
                if (!part.renameTo(file)) part.delete()
            }
        }
    }

    /** The file gone, once every write asked before it is done, so none
     *  of them puts it back. */
    suspend fun delete() {
        withContext(writing) { file.delete() }
    }
}
