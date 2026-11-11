package app.wingtipmaps.android.plates

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.wingtipmaps.android.api.generated.PlateOverlay
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

/**
 * The plate card's controls and the plate they change on the map: the
 * settings start as ForeFlight's (annotations on, not inverted, nearly
 * solid) and are kept across launches on the phone; Hide Plate takes the
 * plate off the map and the Approach Plates switch brings it back; the
 * slider holds between clear and solid and is written once a drag; Show
 * Annotations off draws no tags; View Full Screen finds the FAA's page by
 * the plate's name.
 */
class PlateCardModelTest {
    private val dir = createTempDirectory("plates").toFile()
    private val io = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val file = PreferenceDataStoreFactory.create(scope = io) { File(dir, "settings.preferences_pb") }

    @After
    fun tearDown() {
        io.cancel()
        dir.deleteRecursively()
    }

    private val kosh = PlatePick("KOSH", "I36")
    private val overlay = PlateOverlay(circling = true, cycle = "2611", east = -88.50, fixes = listOf("POBER"), name = "ILS OR LOC RWY 36", north = 44.05, south = 43.85, west = -88.62)

    private fun plates(scope: CoroutineScope) = PlatesOnMap(scope, plate = { if (it == kosh) overlay else null }, approaches = { listOf("I36", "R09") })

    @Test
    fun theSettingsStartAsForeFlightsAndAreKeptOnThePhone() = runBlocking {
        val first = PlateLookStore(file, this)
        first.loaded.join()
        assertEquals(PlateLook(annotations = true, invert = false, opacity = PlateLook.DEFAULT_OPACITY, shown = true), first.look.value)
        first.setAnnotations(false).join()
        first.setInvert(true).join()
        first.setOpacity(0.4f).join()

        val next = PlateLookStore(file, this)
        next.loaded.join()
        assertEquals(PlateLook(annotations = false, invert = true, opacity = 0.4f, shown = true), next.look.value)
    }

    @Test
    fun theSliderHoldsBetweenClearAndSolidAndIsWrittenAsTheDragEnds() = runBlocking {
        val store = PlateLookStore(file, this)
        store.loaded.join()
        val card = PlateCardModel(store, plates(this)) { _, _ -> null }
        card.dragOpacity(2f)
        assertEquals(1f, store.look.value.opacity, 0f)
        card.dragOpacity(-1f)
        assertEquals(PlateLook.LEAST_OPACITY, store.look.value.opacity, 0f)
        // Dragged but not let go: nothing written yet.
        val unwritten = PlateLookStore(file, this).also { it.loaded.join() }
        assertEquals(PlateLook.DEFAULT_OPACITY, unwritten.look.value.opacity, 0f)
        card.keepOpacity().join()
        val kept = PlateLookStore(file, this).also { it.loaded.join() }
        assertEquals(PlateLook.LEAST_OPACITY, kept.look.value.opacity, 0f)
    }

    @Test
    fun hidePlateTakesItOffTheMapAndTheSwitchBringsItBack() = runBlocking {
        val store = PlateLookStore(file, this).also { it.loaded.join() }
        val plates = plates(this)
        val card = PlateCardModel(store, plates) { _, _ -> null }
        assertTrue(plates.showChart("KOSH", "ILS or LOC Rwy 36"))
        assertEquals(listOf(kosh), plates.state.value.drawn(store.look.value).map { it.pick })

        card.hide(kosh)
        assertTrue(plates.state.value.drawn(store.look.value).isEmpty())
        // The approach stays put on the map's list: only its plate is off.
        assertEquals(listOf(kosh), plates.state.value.picks)

        card.setShown(false)
        card.setShown(true)
        assertEquals(listOf(kosh), plates.state.value.drawn(store.look.value).map { it.pick })

        // Off, none drawn; and put on the map again, a hidden plate is back.
        card.setShown(false)
        assertTrue(plates.state.value.drawn(store.look.value).isEmpty())
        card.setShown(true)
        card.hide(kosh)
        plates.show(kosh)
        assertFalse(kosh in plates.state.value.hidden)
    }

    @Test
    fun aChartNoApproachHasIsNotPlaced() = runBlocking {
        val plates = plates(this)
        assertFalse(plates.showChart("KOSH", "VOR RWY 9"))
        assertTrue(plates.state.value.picks.isEmpty())
    }

    @Test
    fun showAnnotationsOffDrawsNoTags() = runBlocking {
        val pober = EngineContract.ApproachFixTag(
            "POBER", 43.9, -88.56, listOf("IAF", "FAF"), missed = false,
            altitude = EngineContract.ApproachFixTagAltitude("at_or_above", minFt = 2700.0),
        )
        val tags = PlateTagsModel(this) { EngineContract.ApproachFixTagsAnswer(listOf(pober), final = null) }
        val placed = PlacedPlate.of(kosh, overlay)!!
        tags.want(listOf(kosh))
        yield()
        assertTrue(tags.drawing(listOf(placed), PlateLook()).labels.isNotEmpty())
        assertEquals(PlateTagsModel.Drawing.NONE, tags.drawing(listOf(placed), PlateLook(annotations = false)))
    }

    @Test
    fun viewFullScreenFindsTheFaasPageByThePlatesName() = runBlocking {
        val store = PlateLookStore(file, this).also { it.loaded.join() }
        val plates = plates(this)
        val card = PlateCardModel(store, plates) { ident, name -> if (ident == "KOSH" && name == "ILS OR LOC RWY 36") "https://aeronav.faa.gov/d-tpp/2611/00395IL36.PDF" else null }
        assertNull(card.fullScreen(kosh))
        plates.showChart("KOSH", "ILS OR LOC RWY 36")
        assertEquals("https://aeronav.faa.gov/d-tpp/2611/00395IL36.PDF", card.fullScreen(kosh))
    }
}
