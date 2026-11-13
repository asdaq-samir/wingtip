package app.wingtipmaps.android.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** A pack on the phone is fetched again when the planner lists another
 *  crc32 for it (CyclePacks.keep): the crc32 it was written with is read
 *  from its header, at byte 36, little-endian, as wingtip.cycle_pack's
 *  write_phone lists it in /api/cycle-packs. The iOS app's
 *  CyclePackRefreshTests. */
class CyclePackCrcTest {
    @Test
    fun theCrc32IsReadFromThePacksHeader() {
        val file = File.createTempFile("pack", ".pack")
        try {
            // Over 2^31, as a crc32 may be: kept unsigned, as the list's Long.
            file.writeBytes(ByteArray(36) + byteArrayOf(0x78, 0x56, 0x34, 0x92.toByte()) + ByteArray(24))
            assertEquals(0x9234_5678L, CyclePacks.crc32(file))
        } finally {
            file.delete()
        }
    }

    @Test
    fun aPackNotOnThePhoneOrCutShortHasNone() {
        assertNull(CyclePacks.crc32(File("no-such-pack.pack")))
        val file = File.createTempFile("short", ".pack")
        try {
            file.writeBytes(ByteArray(38))
            assertNull(CyclePacks.crc32(file))
        } finally {
            file.delete()
        }
    }
}
