package app.wingtipmaps.android.ai.read

import app.wingtipmaps.android.documents.model.LogbookPageRead
import org.junit.Assert.assertTrue
import org.junit.Test

/** The shape Nano fills is the generated read's own, by its wire names. */
class SchemaSketchTest {
    @Test
    fun sketchesTheLogbookPageByItsWireNames() {
        val sketch = SchemaSketch.of(LogbookPageRead.serializer().descriptor)
        assertTrue(sketch, sketch.startsWith("{"))
        assertTrue(sketch, "\"page_totals\"" in sketch)
        assertTrue(sketch, "\"rows\": [{" in sketch)
        assertTrue(sketch, "\"day_landings\": 0.0|null" in sketch)
    }

    @Test
    fun unfencesAModelsJson() {
        assertTrue(OnPhoneReader.unfenced("```json\n{\"rows\": []}\n```") == "{\"rows\": []}")
    }
}
