package app.wingtipmaps.android.logbook

import android.content.Context
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.SavedTrack
import app.wingtipmaps.android.readWhole
import app.wingtipmaps.android.writeWhole
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import java.io.File

/** A logged flight's track and the saved flight it goes to. */
@Serializable
data class Unsent(val flight: Long, val track: SavedTrack)

/** Where the unsent tracks are kept: the phone's file, a fake in the tests. */
interface TrackShelf {
    val unsent: StateFlow<List<Unsent>>

    /** The last upload's failure, in plain words, while a track is unsent. */
    val problem: StateFlow<String?>

    /** A track kept to be sent, returning once it is on the disk. */
    suspend fun keep(item: Unsent, problem: String)

    /** Each kept track sent with `upload`, those that went let go; a
     *  failure keeps its track and says why. */
    suspend fun send(upload: suspend (Long, SavedTrack) -> Unit)
}

/**
 * The flown tracks logged whose upload to their saved flight has not gone
 * through yet (no signal after landing is common), kept on the phone until
 * it has: the only copy of a flight's track once the recorder has let it
 * go (the iPhone's UnsentTracks, IOS-1). Sent by WorkManager once there is
 * a network (UnsentTracksWorker), and gone with the recorder's own
 * track when the pilot signs out (PhoneWipe).
 */
class UnsentTracks(private val file: File) : TrackShelf {
    private val _unsent = MutableStateFlow(
        file.readWhole()?.let { runCatching { Gateway.json.decodeFromString<List<Unsent>>(it) }.getOrNull() }.orEmpty(),
    )
    override val unsent: StateFlow<List<Unsent>> = _unsent.asStateFlow()
    // Kept from an earlier run: said so until it is sent.
    private val _problem = MutableStateFlow(if (_unsent.value.isEmpty()) null else KEPT)
    override val problem: StateFlow<String?> = _problem.asStateFlow()
    private val sending = Mutex()
    private val writing = Mutex()

    override suspend fun keep(item: Unsent, problem: String) {
        _unsent.update { it + item }
        _problem.value = problem
        write()
    }

    override suspend fun send(upload: suspend (Long, SavedTrack) -> Unit) {
        if (_unsent.value.isEmpty() || !sending.tryLock()) return
        try {
            for (item in _unsent.value) {
                try {
                    upload(item.flight, item.track)
                    _unsent.update { it - item }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    _problem.value = Problems.say("The flown track could not be sent", e)
                }
            }
            if (_unsent.value.isEmpty()) _problem.value = null
            write()
        } finally {
            sending.unlock()
        }
    }

    /** Every kept track gone, and its file (signing out, deleting the account). */
    suspend fun wipe() = writing.withLock {
        _unsent.value = emptyList()
        _problem.value = null
        withContext(Dispatchers.IO) { file.delete() }
    }

    /** Written whole and flushed to the disk (AtomicFile, WholeFiles),
     *  awaited, so the recorder lets its own copy go only once this one is
     *  on the disk: it is the only copy of the flight's track. */
    private suspend fun write() = writing.withLock {
        val text = Gateway.json.encodeToString(_unsent.value)
        withContext(Dispatchers.IO) { file.writeWhole(text) }
    }

    companion object {
        /** What a track kept from an earlier run says, its failure gone. */
        const val KEPT = "A flown track is kept on this phone until it can be sent to its saved flight."

        @Volatile
        private var shared: UnsentTracks? = null

        /** The app's one shelf, in filesDir/tracks-unsent.json. */
        fun of(context: Context): UnsentTracks =
            shared ?: synchronized(this) {
                shared ?: UnsentTracks(File(context.applicationContext.filesDir, "tracks-unsent.json")).also { shared = it }
            }
    }
}
