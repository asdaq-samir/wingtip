package app.wingtipmaps.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

/** The app's own files written behind on one writer (KeptFile): in the
 *  order asked, the text made on the writer, and a delete after every
 *  write asked before it, so none of them puts the file back. */
class KeptFileTest {
    private val dir = createTempDirectory("kept-file").toFile()
    private val file = File(dir, "track.json")
    private val writing = Dispatchers.IO.limitedParallelism(1)

    @After
    fun tearDown() {
        dir.deleteRecursively()
    }

    /** Every write asked so far done: the writer's next turn. */
    private suspend fun settled() = withContext(writing) {}

    @Test
    fun writesLandInTheOrderAsked() = runBlocking {
        val kept = KeptFile(file, writing)
        assertNull(kept.read())
        kept.write { "one" }
        kept.write { "two" }
        settled()
        assertEquals("two", kept.read())
        assertFalse(File(file.path + ".part").exists())
    }

    @Test
    fun aDeleteComesAfterTheWritesBeforeIt() = runBlocking {
        val kept = KeptFile(file, writing)
        kept.write { "track" }
        kept.delete()
        assertFalse(file.exists())
    }

    @Test
    fun theTextIsMadeOnTheWriter() = runBlocking {
        val kept = KeptFile(file, writing)
        var madeOn: Thread? = null
        kept.write {
            madeOn = Thread.currentThread()
            "track"
        }
        settled()
        assertFalse(madeOn == Thread.currentThread())
    }
}
