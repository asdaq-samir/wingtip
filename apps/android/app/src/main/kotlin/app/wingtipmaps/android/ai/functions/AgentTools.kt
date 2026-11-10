package app.wingtipmaps.android.ai.functions

import android.app.Application
import app.wingtipmaps.android.api.Gateway
import com.google.mlkit.genai.common.FunctionArgValue
import com.google.mlkit.genai.common.FunctionCall
import com.google.mlkit.genai.schema.tools.FunctionDeclaration
import com.google.mlkit.genai.schema.tools.FunctionSchema
import com.google.mlkit.genai.schema.tools.FunctionType
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/**
 * The app's AppFunctions as Gemini Nano's tools in the app's own Ask: the
 * declarations read from the compiler's schema (FunctionSchemaXml), and
 * each call answered by WingtipActions -- the answers Gemini gets through
 * WingtipFunctions -- as JSON the model reads. An action that opens a
 * screen opens it here through `open`, the app being in front.
 */
class AgentTools(private val app: Application, private val open: (String) -> Unit) {
    private val actions = WingtipActions(app)

    /** The tools, read once from the APK's asset. */
    val declarations: List<FunctionDeclaration> by lazy {
        app.assets.open(FunctionSchemaXml.ASSET).use(FunctionSchemaXml::read).map(::declaration)
    }

    /** One call answered: the action's entity as JSON under "result", or
     *  why there is none under "error", for the model to say. */
    suspend fun run(call: FunctionCall): Map<String, Any?> {
        val args = call.arguments.mapValues { plain(it.value) }
        return try {
            mapOf("result" to dispatch(call.name, args))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            mapOf("error" to (e.message ?: "The app could not answer."))
        }
    }

    /** The action named, by WingtipFunctions' method names. */
    private suspend fun dispatch(name: String, a: Map<String, Any?>): Any? = when (name) {
        "findAirport" -> json(AirportEntity.serializer(), actions.airport(str(a, "ident")))
        "searchAirports" -> json(ListSerializer(AirportEntity.serializer()), actions.search(str(a, "query")))
        "nearestAirports" -> json(ListSerializer(NearestEntity.serializer()), actions.nearest())
        "airportFrequencies" -> json(ListSerializer(FrequencyEntity.serializer()), actions.frequencies(str(a, "ident")))
        "airportApproaches" -> json(ListSerializer(ApproachEntity.serializer()), actions.approaches(str(a, "ident")))
        "plannedRoute" -> json(RouteEntity.serializer(), actions.route())
        "routeNotams" -> json(ListSerializer(NotamEntity.serializer()), actions.notams())
        "briefVerdict" -> json(BriefEntity.serializer(), actions.brief())
        "myAirplanes" -> json(ListSerializer(AirplaneEntity.serializer()), actions.airplanes())
        "logbookFlights" -> json(ListSerializer(LogbookEntryEntity.serializer()), actions.logbook((a["count"] as? Number)?.toInt() ?: 3))
        "openScreen" -> opened(actions.screen(str(a, "screen")))
        "planRoute" -> opened(actions.plan(str(a, "dep"), str(a, "dest"), (a["stops"] as? List<*>).orEmpty().map { it.toString() }))
        "showAirport" -> opened(actions.showAirport(str(a, "ident")))
        "openEmergency" -> opened(actions.screen("emergency"))
        else -> throw WingtipActions.NoAnswer("The app has no tool \"$name\".")
    }

    private fun opened(o: WingtipActions.Opening): String {
        open(o.link)
        return o.said
    }

    private fun str(a: Map<String, Any?>, key: String): String = a[key]?.toString().orEmpty()

    private fun <T> json(serializer: KSerializer<T>, value: T): Any? = plain(Gateway.json.encodeToJsonElement(serializer, value))

    companion object {
        /** The schema's parameter as Nano's FunctionSchema. */
        fun declaration(tool: FunctionSchemaXml.Tool): FunctionDeclaration {
            val properties = tool.params.associate { p -> p.name to schema(p) }
            val required = tool.params.filter { it.required }.map { it.name }
            return FunctionDeclaration(tool.name, tool.description, FunctionSchema(FunctionType.OBJECT, null, properties, required))
        }

        private fun schema(p: FunctionSchemaXml.Param): FunctionSchema = when (p.kind) {
            FunctionSchemaXml.Kind.STRING, FunctionSchemaXml.Kind.OTHER -> FunctionSchema(FunctionType.STRING, p.description)
            FunctionSchemaXml.Kind.INT, FunctionSchemaXml.Kind.LONG -> FunctionSchema(FunctionType.INTEGER, p.description)
            FunctionSchemaXml.Kind.DOUBLE -> FunctionSchema(FunctionType.NUMBER, p.description)
            FunctionSchemaXml.Kind.BOOLEAN -> FunctionSchema(FunctionType.BOOLEAN, p.description)
            FunctionSchemaXml.Kind.STRING_LIST -> FunctionSchema(
                FunctionType.ARRAY, p.description, null, null, null, null, null, FunctionSchema(FunctionType.STRING),
            )
        }

        /** A tool call's argument as a plain Kotlin value. */
        fun plain(v: FunctionArgValue): Any = when (v) {
            is FunctionArgValue.StringValue -> v.value
            is FunctionArgValue.IntValue -> v.value
            is FunctionArgValue.LongValue -> v.value
            is FunctionArgValue.DoubleValue -> v.value
            is FunctionArgValue.BoolValue -> v.value
            is FunctionArgValue.ListValue -> v.values.map(::plain)
            is FunctionArgValue.MapValue -> v.map.mapValues { plain(it.value) }
        }

        /** A tool's answer as JSON again, for its source chip. */
        fun json(v: Any?): JsonElement = when (v) {
            null -> JsonNull
            is Map<*, *> -> JsonObject(v.entries.associate { it.key.toString() to json(it.value) })
            is List<*> -> JsonArray(v.map(::json))
            is Boolean -> JsonPrimitive(v)
            is Number -> JsonPrimitive(v)
            else -> JsonPrimitive(v.toString())
        }

        /** JSON as maps, lists and primitives, as Nano's tool answers take it. */
        fun plain(e: JsonElement): Any? = when (e) {
            is JsonNull -> null
            is JsonObject -> e.mapValues { plain(it.value) }
            is JsonArray -> e.map(::plain)
            is JsonPrimitive -> if (e.isString) e.content else e.booleanOrNull ?: e.longOrNull ?: e.doubleOrNull ?: e.content
        }
    }
}
