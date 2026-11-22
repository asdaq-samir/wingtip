package app.wingtipmaps.android.library

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

/** The pilot's own PDFs (OwnShelf): only a PDF is kept, renamed in place,
 *  and a delete is put back by its Undo or forgotten after it. */
class OwnShelfTest {
    private val dir = Files.createTempDirectory("own").toFile().apply { deleteOnExit() }
    private val shelf = OwnShelf(dir)

    private fun add(name: String, bytes: ByteArray) = runBlocking { shelf.add(name) { it.writeBytes(bytes) } }

    @Test
    fun aPdfIsKeptUnderItsNameWithoutTheExtension() {
        val doc = add("POH.pdf", "%PDF-1.7\n".toByteArray())
        assertEquals("POH", doc.name)
        assertTrue(shelf.file(doc.id).isFile)
        assertEquals(listOf(doc), shelf.documents.value)
    }

    @Test(expected = OwnShelf.NotPdf::class)
    fun aFileThatIsNotAPdfIsRefused() {
        add("photo.jpg", byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0, 0))
    }

    @Test
    fun aDeleteIsPutBackByItsUndoOrForgottenAfter() {
        val doc = add("Insurance.pdf", "%PDF-1.4".toByteArray())
        shelf.rename(doc.id, "  Insurance 2027 ")
        assertEquals("Insurance 2027", shelf.documents.value.single().name)
        val gone = shelf.remove(doc.id)!!
        assertTrue(shelf.documents.value.isEmpty())
        shelf.putBack(gone)
        assertEquals(1, shelf.documents.value.size)
        shelf.remove(doc.id)
        shelf.forget(doc.id)
        assertFalse(shelf.file(doc.id).exists())
    }
}
