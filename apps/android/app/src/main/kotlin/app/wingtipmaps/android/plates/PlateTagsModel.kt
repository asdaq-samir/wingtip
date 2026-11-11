package app.wingtipmaps.android.plates

import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.coach.CoachApproaches
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.approachFixTags
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The engine's approach_fix_tags answer for an approach. */
typealias Tags = EngineContract.ApproachFixTagsAnswer

/**
 * The tags on the approaches' fixes and their finals, for the plates
 * drawn (PlatesOnMap): each approach's asked once of the engine, from
 * its procedure as the planner draws it, and written as the map's GeoJSON
 * -- one point a tag with its lines of words, one line a final -- while
 * Show Annotations is on, nothing while it is off.
 *
 * @param tagsOf an approach's tags, null where it has none.
 */
class PlateTagsModel(private val scope: CoroutineScope, private val tagsOf: suspend (PlatePick) -> Tags?) {
    private val _tags = MutableStateFlow<Map<PlatePick, Tags>>(emptyMap())
    val tags: StateFlow<Map<PlatePick, Tags>> = _tags.asStateFlow()
    private val asked = HashSet<PlatePick>()

    /** The tags of these approaches asked for, each once. */
    fun want(picks: Collection<PlatePick>) {
        for (pick in picks) {
            if (!asked.add(pick)) continue
            scope.launch {
                val found = try {
                    tagsOf(pick)
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    null
                }
                if (found == null) asked.remove(pick) else _tags.update { it + (pick to found) }
            }
        }
    }

    /** What the map draws for these plates: the tags' points and the
     *  finals' lines, both empty with Show Annotations off. */
    fun drawing(plates: List<PlacedPlate>, look: PlateLook): Drawing =
        if (!look.annotations) Drawing.NONE else drawing(plates.mapNotNull { _tags.value[it.pick] })

    /** The map's two GeoJSON texts -- the tags as points, each naming its
     *  picture (`image`), and the finals as lines -- and each picture's
     *  words by its name, drawn once (PlateLayer). */
    data class Drawing(val points: String, val finals: String, val labels: Map<String, Label> = emptyMap()) {
        companion object {
            val NONE = drawing(emptyList())
        }
    }

    /** A tag's picture: its lines, and whether it is the runway's, set
     *  apart as ForeFlight sets its runway tag apart. */
    data class Label(val lines: List<TagLine>, val runway: Boolean) {
        /** The picture's name, the same for the same words. */
        val id: String get() = "plate-tag|" + (if (runway) "map|" else "") + lines.joinToString("|") { (if (it.over) "^" else "") + it.text + (if (it.under) "_" else "") }
    }

    companion object {
        /** Each tag a point naming its picture and its fix, each final a line. */
        fun drawing(approaches: List<Tags>): Drawing {
            val labels = LinkedHashMap<String, Label>()
            val points = approaches.flatMap { it.tags }.map { tag ->
                val label = Label(PlateTagWords.lines(tag), runway = "MAP" in tag.roles)
                labels[label.id] = label
                feature(point(tag.lon, tag.lat)) {
                    put("ident", tag.ident)
                    put("image", label.id)
                }
            }
            val finals = approaches.map(PlateTagWords::finalPoints).filter { it.size >= 2 }.map { line ->
                feature(
                    buildJsonObject {
                        put("type", "LineString")
                        put("coordinates", buildJsonArray { line.forEach { (lat, lon) -> add(lonLat(lon, lat)) } })
                    },
                ) {}
            }
            return Drawing(collection(points), collection(finals), labels)
        }

        private fun lonLat(lon: Double, lat: Double) = JsonArray(listOf(JsonPrimitive(lon), JsonPrimitive(lat)))

        private fun point(lon: Double, lat: Double) = buildJsonObject {
            put("type", "Point")
            put("coordinates", lonLat(lon, lat))
        }

        private fun feature(geometry: JsonObject, properties: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = buildJsonObject {
            put("type", "Feature")
            put("geometry", geometry)
            put("properties", buildJsonObject(properties))
        }

        private fun collection(features: List<JsonObject>) = buildJsonObject {
            put("type", "FeatureCollection")
            put("features", JsonArray(features))
        }.toString()

        /** The app's one model, asking the planner for the procedure as it
         *  draws it (as the coach does) and the engine for its tags. */
        val shared: PlateTagsModel by lazy {
            PlateTagsModel(CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)) { pick ->
                Engine.approachFixTags(CoachApproaches.drawing(Planner.fetch("/api/airport/${pick.ident}/procedures/${pick.procedure}"))).getOrNull()
            }
        }
    }
}
