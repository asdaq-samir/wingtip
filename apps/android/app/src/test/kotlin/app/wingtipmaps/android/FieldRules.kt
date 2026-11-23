package app.wingtipmaps.android

import app.wingtipmaps.android.route.SameField
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The engine's field rules answered for the JVM's unit tests, where the
 * engine does not load: `same_field` as engine/crates/flight/src/ident.rs
 * has it (a K and three letters or figures is the three, FAA JO 7350.9),
 * held there by its own tests, and `field_names` from the shared fixture
 * the engine's facade test reads (fieldNames.json, on the test's
 * classpath), failing on an ident the fixture does not list.
 */
object FieldRules {
    private fun bare(ident: String): String {
        val s = ident.trim().uppercase()
        return if (s.length == 4 && s.startsWith("K") && s.all { it in 'A'..'Z' || it in '0'..'9' }) s.drop(1) else s
    }

    val same: SameField = { a, b -> bare(a) == bare(b) }

    private val cases = Json.parseToJsonElement(
        checkNotNull(javaClass.classLoader!!.getResource("fieldNames.json")) { "fieldNames.json is not on the test's classpath" }.readText(),
    ).jsonObject.getValue("cases").jsonArray.map { it.jsonObject }

    /** The fixture's names for an ident given with no ICAO_ID. */
    fun names(ident: String): List<String> =
        cases.first { it.getValue("ident").jsonPrimitive.content == ident && it["icao_id"] == JsonNull }
            .getValue("names").jsonArray.map { it.jsonPrimitive.content }
}
