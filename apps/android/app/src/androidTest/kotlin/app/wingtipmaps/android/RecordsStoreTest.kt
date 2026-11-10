package app.wingtipmaps.android

import android.database.sqlite.SQLiteDatabase
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.records.KeptAirplane
import app.wingtipmaps.android.records.Records
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The records store on Room 3 (androidx.room3) over the framework's
 * SQLite: a file Room 2.8 wrote opens with its rows, not wiped by the
 * destructive fallback, and the DAO reads back what it writes.
 */
@RunWith(AndroidJUnit4::class)
class RecordsStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "records-room2.db"

    @After
    fun tidy() {
        context.deleteDatabase(name)
    }

    @Test
    fun aFileRoom2WroteOpensWithItsRows() = runBlocking {
        context.deleteDatabase(name)
        // Version 1 as Room 2.8.5's compiler wrote it (RecordsDatabase_Impl):
        // the same tables, and its identity hash in room_master_table.
        SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath(name), null).use { db ->
            db.execSQL("CREATE TABLE IF NOT EXISTS `kept_airplanes` (`hex` TEXT NOT NULL, `name` TEXT NOT NULL, `type` TEXT, `favorite` INTEGER NOT NULL, `recent` INTEGER NOT NULL, `addedAt` INTEGER NOT NULL, `recentAt` INTEGER, PRIMARY KEY(`hex`))")
            db.execSQL("CREATE TABLE IF NOT EXISTS `watches` (`hex` TEXT NOT NULL, `name` TEXT NOT NULL, `kind` TEXT NOT NULL, `setAt` INTEGER NOT NULL, PRIMARY KEY(`hex`, `kind`))")
            db.execSQL("CREATE TABLE IF NOT EXISTS `planned_routes` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `dep` TEXT NOT NULL, `dest` TEXT NOT NULL, `stopsLine` TEXT NOT NULL, `altitudeFt` REAL, `altitudeChoice` TEXT, `plannedAt` INTEGER NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)")
            db.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, '9235c07e0277ebc852303ed02a95f727')")
            db.execSQL("INSERT INTO kept_airplanes VALUES ('a1b2c3', 'N123AB', 'C172', 1, 0, 1000, NULL)")
            db.version = 1
        }
        val store = Records.open(context, name)
        try {
            assertEquals(listOf(KeptAirplane(hex = "a1b2c3", name = "N123AB", type = "C172", favorite = true, addedAt = 1000)), store.dao().favorites())
        } finally {
            store.close()
        }
    }

    @Test
    fun theDaoReadsBackWhatItWrites() = runBlocking {
        val store = Records.inMemory(context)
        try {
            val row = KeptAirplane(hex = "abc123", name = "N1", recent = true, addedAt = 1, recentAt = 2)
            store.dao().putAirplane(row)
            assertEquals(row, store.dao().keptAirplane("abc123"))
            store.erase()
            assertEquals(emptyList<KeptAirplane>(), store.dao().recents())
        } finally {
            store.close()
        }
    }
}
