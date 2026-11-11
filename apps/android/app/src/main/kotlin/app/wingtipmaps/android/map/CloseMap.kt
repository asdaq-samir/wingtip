package app.wingtipmaps.android.map

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.edit
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.await
import app.wingtipmaps.android.api.googleMaps
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.security.MessageDigest

/**
 * The street map close in, under the runways where the chart is only
 * enlarged, as ForeFlight, Google Maps and Apple Maps show it (the owner's
 * ask): Google's Map Tiles API, with the deployment's key from the planner
 * (/api/map/google), as the web's BaseGl CloseBase draws it. A session for
 * the road map is made once and kept until a day before it runs out (two
 * weeks, Google says), and a session made with another key is not reused.
 * Where the deployment has no key -- none is set today (.env's
 * GOOGLE_MAPS_API_KEY) -- nothing is drawn and the chart stays, enlarged,
 * as on the web.
 *
 * The planner's key is a browser key, restricted to the site's address in
 * Google Cloud; the build may carry a key of the app's own instead
 * (Config.googleMapsAndroidKey, GOOGLE_MAPS_ANDROID_KEY), restricted to
 * this app by package name and signing certificate, which Google reads
 * from the headers `signer` puts on every request to it.
 */
object CloseMap {
    const val GOOGLE = "https://tile.googleapis.com"

    @Serializable
    private data class Session(val session: String, val expiry: Long, val key: String)

    @Serializable
    private class SessionAsk(val mapType: String, val language: String, val region: String, val imageFormat: String)

    @Serializable
    private class SessionAnswer(val session: String, val expiry: String)

    /** The road map's tile address for MapLibre, or null where there is
     *  no key or Google made no session. */
    suspend fun tiles(context: Context): String? {
        // The app's own Android-restricted key first, else the deployment's.
        val key = Config.googleMapsAndroidKey ?: Planner.googleMaps()?.key ?: return null
        val session = session(context, key) ?: return null
        return "$GOOGLE/v1/2dtiles/{z}/{x}/{y}?session=${enc(session.session)}&key=${enc(key)}"
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private suspend fun session(context: Context, key: String): Session? {
        val prefs = context.getSharedPreferences("wingtip", Context.MODE_PRIVATE)
        val held = prefs.getString(KEPT, null)?.let { runCatching { Gateway.json.decodeFromString<Session>(it) }.getOrNull() }
        if (held != null && held.key == key && held.expiry * 1000 - System.currentTimeMillis() > DAY_MS) return held
        val body = Gateway.json.encodeToString(SessionAsk("roadmap", "en-US", "US", "png"))
        val request = Request.Builder()
            .url("$GOOGLE/v1/createSession?key=${enc(key)}")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        val answer = Gateway.client.newCall(request).await().use { response ->
            if (!response.isSuccessful) return null
            Gateway.json.decodeFromString<SessionAnswer>(response.body.string())
        }
        val session = Session(answer.session, answer.expiry.toLongOrNull() ?: return null, key)
        prefs.edit { putString(KEPT, Gateway.json.encodeToString(session)) }
        return session
    }

    /** The app's package and signing certificate on every request to
     *  Google's APIs, as an Android-restricted key asks them. */
    fun signer(context: Context): Interceptor {
        val app = context.applicationContext
        val cert by lazy { certificateSha1(app) }
        return Interceptor { chain ->
            val request = chain.request()
            if (!request.url.host.endsWith("googleapis.com")) return@Interceptor chain.proceed(request)
            val signed = request.newBuilder().header("X-Android-Package", app.packageName)
                .apply { cert?.let { header("X-Android-Cert", it) } }
                .build()
            chain.proceed(signed)
        }
    }

    /** The app's signing certificate's SHA-1 in capitals, no colons. */
    private fun certificateSha1(context: Context): String? = runCatching {
        val pm = context.packageManager
        val signature = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                .signingInfo?.apkContentsSigners?.firstOrNull()
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures?.firstOrNull()
        } ?: return null
        MessageDigest.getInstance("SHA-1").digest(signature.toByteArray()).joinToString("") { "%02X".format(it) }
    }.getOrNull()

    private const val KEPT = "google_session_map"
    private const val DAY_MS = 24 * 3600_000L
}
