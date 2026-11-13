package app.wingtipmaps.android.diagnostics

import android.content.Context
import android.os.Build
import app.wingtipmaps.android.BuildConfig
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.FaultReport
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import okhttp3.CookieJar
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.coroutines.executeAsync
import java.util.concurrent.TimeUnit

/**
 * Posts a report to the gateway (POST /api/diagnostics), which keeps the
 * faults 30 days for the developer and puts the figures in the speed
 * trend under "android". Never throws: a report that could not be sent
 * says so by returning false, and its faults are tried again next start.
 */
object DiagnosticsReporter {
    /** The app's one client, without its cookies: the gateway would read
     *  the session's cookie as the pilot's, and a report is no one's. */
    private val client: OkHttpClient by lazy { Gateway.client.newBuilder().cookieJar(CookieJar.NO_COOKIES).callTimeout(Gateway.WRITE_TIMEOUT_S, TimeUnit.SECONDS).build() }

    /** Sent and taken (any answer but a server's error: a 400 would come
     *  back the same next time, so its faults are not kept for it). */
    suspend fun send(context: Context, faults: List<FaultReport>, metrics: Map<String, Double>): Boolean {
        val body = DiagnosticsBodies.build(
            versionName = BuildConfig.VERSION_NAME,
            versionCode = BuildConfig.VERSION_CODE,
            release = Build.VERSION.RELEASE ?: "",
            // Android's own line between a phone and a tablet: 600 dp the
            // narrower way (the sw600dp resource qualifier).
            tablet = context.resources.configuration.smallestScreenWidthDp >= 600,
            faults = faults,
            metrics = metrics,
        ) ?: return true
        return try {
            val request = Request.Builder()
                .url(Config.gateway + "/api/diagnostics")
                .post(Gateway.json.encodeToString(body).toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).executeAsync().use { it.code < 500 }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }
    }
}
