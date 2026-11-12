package app.wingtipmaps.android.api

import android.annotation.SuppressLint
import android.content.Context
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.gateway.LinkAccount
import app.wingtipmaps.android.api.generated.gateway.MagicLinkRequest
import app.wingtipmaps.android.map.OverlayCache
import app.wingtipmaps.android.map.OverlayStore
import app.wingtipmaps.android.offline.KeptLoopTiles
import app.wingtipmaps.android.offline.LoopTileFallback
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Cache
import okhttp3.Call
import okhttp3.Callback
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * The gateway's calls, by hand, as the iOS app's Gateway.swift has them:
 * its OpenAPI document gives them star-slash-star bodies, which a generated client
 * would hand over raw. One OkHttp client for the whole app, with the
 * session cookie the gateway sets kept by CookieStore, so a call made
 * after signing in is the pilot's, as in Chrome.
 */
@SuppressLint("StaticFieldLeak") // the application's context alone (attach), which lives as long as the process
object Gateway {
    /** The coder for the servers' JSON: a key not modelled is passed
     *  over, and a null is left out of a body. The planner's snake case
     *  is carried by each model's @SerialName (Models.kt). */
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private lateinit var app: Context

    /** The application, for the preferences and the cache's folder
     *  (WingtipApplication.onCreate); nothing is built until first used. */
    fun attach(context: Context) {
        app = context.applicationContext
    }

    val cookies: CookieStore by lazy { CookieStore(SealedShelf(app.getSharedPreferences("cookies", Context.MODE_PRIVATE), KeystoreSeal())) }

    /** The overlay tiles' archive kept on the phone, for the air
     *  (OverlayStore): in the app's files, not its cache, which the system
     *  may empty before a flight. */
    val overlayStore: OverlayStore by lazy { OverlayStore(File(app.filesDir, "overlay-tiles")) }

    /** The weather loop's newest frame kept over the route (Keep for the
     *  Air), beside the other answers kept for the air. */
    val loopTiles: KeptLoopTiles by lazy { KeptLoopTiles(File(app.filesDir, "kept-air/loop-tiles")) }

    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cookieJar(cookies)
            // The archive's byte ranges answered from the phone where kept,
            // and kept as they come: OkHttp's cache keeps no 206.
            .addInterceptor(OverlayCache(overlayStore))
            // The loop's kept tiles answered from the phone with no network.
            .addInterceptor(LoopTileFallback(loopTiles))
            // A cache of the answers the gateway and the planner say may be
            // kept (Cache-Control: the chart's tiles for a cycle, the fields
            // and airspace of a box, a field's card for minutes), so a view
            // come back to is answered from the phone, and an answer with an
            // ETag is revalidated in one short round trip -- the same reason
            // as the iOS app's URLCache (the owner's ask for speed,
            // 2026-11-03). Sized for a flight's worth of tiles and answers;
            // the protocol's own policy, so an answer marked no-store is
            // never kept.
            .cache(Cache(File(app.cacheDir, "answers"), 256L shl 20))
            // A whole call's limit (the offline audit's gap 8): on the one
            // bar of a weak link in the air a read fails in seconds into
            // what is kept, not OkHttp's no limit at all. A write gets
            // WRITE_TIMEOUT_S (`call`); a stream or a download `streaming`.
            .callTimeout(READ_TIMEOUT_S, TimeUnit.SECONDS)
            .build()
    }

    /** The client for what takes as long as it takes -- the nav log's and
     *  the assistant's streams, the packs', charts' and overlays' downloads,
     *  the account's export -- with no whole-call limit; OkHttp's 10 s
     *  between bytes still ends one on a dead link. The same pool, cache
     *  and interceptors as `client`. */
    val streaming: OkHttpClient by lazy { client.newBuilder().callTimeout(0, TimeUnit.SECONDS).build() }

    /** The whole-call limits: a read, and a write, which may carry a
     *  scanned page or a track. */
    const val READ_TIMEOUT_S = 10L
    const val WRITE_TIMEOUT_S = 60L

    /** The gateway's own words for a refusal (ErrorResponse), where it
     *  sent any: "Invalid request" with each field's, or the instructor's
     *  rule. */
    class Refusal(val status: Int, val words: String?) : Exception(words ?: "The server answered $status.")

    /** The gateway's CSRF token, from the cookie it sets on every answer. */
    val csrfToken: String?
        get() = cookies.loadForRequest(Config.gateway.toHttpUrl()).firstOrNull { it.name == "XSRF-TOKEN" }?.value

    fun request(method: String, path: String, json: String? = null, form: Map<String, String>? = null): Request {
        val builder = Request.Builder().url(Config.gateway + path).header("Accept", "application/json")
        // Spring Security's CSRF check (SecurityConfig): every POST, PUT and
        // DELETE echoes the XSRF-TOKEN cookie the gateway set in a header,
        // as the web app's client does.
        if (method != "GET") csrfToken?.let { builder.header("X-XSRF-TOKEN", it) }
        val body: RequestBody? = when {
            json != null -> json.toRequestBody("application/json".toMediaType())
            form != null -> FormBody.Builder().apply { form.forEach { (name, value) -> add(name, value) } }.build()
            method == "GET" -> null
            // OkHttp wants a body on a POST, even an empty one (the logout).
            else -> ByteArray(0).toRequestBody(null)
        }
        return builder.method(method, body).build()
    }

    /** One call with the pilot's session: the answer's body and status.
     *  Every gateway call goes through here, and is refused through `send`
     *  or `read` in the gateway's own words. */
    suspend fun call(method: String, path: String, json: String? = null, form: Map<String, String>? = null): Pair<String, Int> =
        client.newCall(request(method, path, json, form)).also { call ->
            if (method != "GET") call.timeout().timeout(WRITE_TIMEOUT_S, TimeUnit.SECONDS)
        }.await().use { response ->
            response.body.string() to response.code
        }

    /** A call whose answer is read, or nothing where the server sends no
     *  body; refused outside `ok`, with the gateway's own words. */
    suspend fun send(method: String, path: String, json: String? = null, form: Map<String, String>? = null, ok: IntRange = 200..299): String {
        val (body, status) = call(method, path, json, form)
        if (status !in ok) throw Refusal(status, words(body))
        return body
    }

    /** A read that is nobody's when signed out: null for the statuses in
     *  `none` (401, 403 and 204 unless a call says otherwise). */
    suspend inline fun <reified T> read(path: String, none: Set<Int> = setOf(204, 401, 403)): T? {
        val (body, status) = call("GET", path)
        if (status == 200) return json.decodeFromString<T>(body)
        if (status in none) return null
        throw Refusal(status, words(body))
    }

    @Serializable
    private class ErrorBody(val error: String? = null, val details: List<String>? = null)

    fun words(body: String): String? {
        val read = runCatching { json.decodeFromString<ErrorBody>(body) }.getOrNull() ?: return null
        val error = read.error ?: return null
        val details = read.details.orEmpty()
        return if (details.isEmpty()) error else "$error: ${details.joinToString("; ")}"
    }

    /** The pilot signed in, or null (the gateway's 204) when no one is. */
    suspend fun me(): Pilot? = read("/api/me", none = setOf(204, 401))

    /** A sign-in link emailed to the pilot; the gateway answers 202
     *  whether or not the address is known. */
    suspend fun requestMagicLink(email: String) {
        send("POST", "/api/auth/magic-link", json = json.encodeToString(MagicLinkRequest(email)))
    }

    /** The link's one-time token, posted as the website's page posts it;
     *  the gateway answers with the session cookie and a redirect, which
     *  the client follows. */
    /** Whose a sign-in link is, without spending it: the address masked
     *  ("a•••@icloud.com"), or null where it is used, expired or unknown
     *  (the gateway's 404); refused in its words otherwise (a 429). */
    suspend fun magicLinkAccount(token: String): LinkAccount? {
        val (body, status) = call("POST", "/api/auth/magic-link/account", form = mapOf("token" to token))
        if (status == 404) return null
        if (status != 200) throw Refusal(status, words(body))
        return json.decodeFromString<LinkAccount>(body)
    }

    suspend fun verifyMagicLink(token: String) {
        send("POST", "/api/auth/magic-link/verify", form = mapOf("token" to token), ok = 200..399)
    }

    /** Spring Security's own logout, which answers 204. */
    suspend fun signOut() {
        call("POST", "/logout")
    }
}

/** An OkHttp call as a suspending one: the coroutine's cancellation
 *  cancels the call, so a screen left stops its fetch. */
suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (!continuation.isCancelled) continuation.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            continuation.resume(response)
        }
    })
    continuation.invokeOnCancellation { cancel() }
}
