package app.wingtipmaps.android

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

/** The app's files written whole through AndroidX's AtomicFile
 *  (WholeFiles): read back as written, replaced whole, nothing left
 *  beside them, and a write cut short never read as the file. */
class WholeFilesTest {
    private val dir = createTempDirectory("whole-files").toFile()
    private val file = File(File(dir, "kept"), "index.json")

    @After
    fun tearDown() {
        dir.deleteRecursively()
    }

    @Test
    fun aFileNotThereReadsAsNothing() {
        assertNull(file.readWhole())
    }

    @Test
    fun aWriteIsReadBackAndItsFolderMade() {
        file.writeWhole("""{"cycle":"2611"}""")
        assertEquals("""{"cycle":"2611"}""", file.readWhole())
    }

    @Test
    fun aSecondWriteReplacesTheFirstAndLeavesNothingBeside() {
        file.writeWhole("one")
        file.writeWhole("two".toByteArray())
        assertEquals("two", file.readWhole())
        assertEquals(listOf("index.json"), file.parentFile!!.list()!!.toList())
    }

    @Test
    fun aWriteCutShortIsNotReadAsTheFile() {
        file.writeWhole("whole")
        // What a kill mid-write leaves: AtomicFile's new file beside it.
        File(file.path + ".new").writeText("hal")
        assertEquals("whole", file.readWhole())
        assertFalse(File(file.path + ".new").exists())
    }
}
