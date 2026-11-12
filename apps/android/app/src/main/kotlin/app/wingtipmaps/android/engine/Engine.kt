package app.wingtipmaps.android.engine

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * wingtip-engine, the planner's own Rust, through its C functions
 * (engine/bindings/ffi) and the JNI shim round them (src/main/cpp/wingtip_jni.c):
 * the same figures the planner works out, here with no network. The twin
 * of the iOS app's Engine.swift.
 *
 * A rule of the engine is asked by its name, as the web app's callEngine
 * and the planner's wingtip_native.call ask it (wt_call): one way in, so a
 * rule moved into the engine needs no new C function or JNI method.
 * call.rs lists every name with its input's keys, which are the rule's
 * own -- mostly snake case, camel case where the gateway's are -- so the
 * input is encoded with its names as written and the answer decoded the
 * same way: no naming strategy is applied here, and a class for a rule's
 * input or answer carries each key by `@SerialName` where it is not the
 * property's own name.
 */
object Engine {
    init {
        System.loadLibrary("wingtip_jni")
    }

    /** The one coder every call shares, made once: a key not modelled is
     *  passed over, and a null is left out of the input, which the engine
     *  reads as a member not given. */
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    /** wt_call: the rule's answer as JSON text, or EngineException thrown
     *  with the engine's own words for what was wrong. */
    @JvmStatic
    external fun callNative(name: String, input: String): String

    /** A rule of the engine by its name, its input encoded and its answer
     *  decoded as written. */
    inline fun <reified In, reified Out> call(name: String, input: In): Out =
        json.decodeFromString<Out>(callNative(name, json.encodeToString<In>(input)))

    /** The way in for the generated functions (engine/generated/EngineCalls.kt,
     *  one per rule of engine/contract/engine.schema.json): the rule's answer,
     *  or its failure -- the engine's refusal or an answer outside the
     *  contract -- logged and held in the Result, so a caller shows it
     *  rather than reading a default value. */
    inline fun <reified In, reified Out> rule(name: String, input: In): Result<Out> =
        runCatching { call<In, Out>(name, input) }.onFailure { failed(name, it) }

    /** A failed rule in the log, by its name and the engine's words; the
     *  input may hold a position, so it is not written. android.util.Log is
     *  absent from the JVM's unit tests, where nothing is logged. */
    @PublishedApi
    internal fun failed(name: String, error: Throwable) {
        val _ = runCatching { android.util.Log.w("engine", "$name failed: ${error.message}") }
    }
}

/** What the engine said was wrong with a call: a name it has no rule for,
 *  an input not of the rule's shape. Thrown by the JNI shim. */
class EngineException(message: String) : RuntimeException(message)
