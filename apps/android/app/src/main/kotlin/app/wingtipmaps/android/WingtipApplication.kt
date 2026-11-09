package app.wingtipmaps.android

import android.app.Application
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.diagnostics.Diagnostics
import org.maplibre.android.MapLibre
import org.maplibre.android.module.http.HttpRequestUtil

/**
 * The process: nothing heavy is made here, only what must exist before
 * the first screen. MapLibre wants its instance made before any MapView,
 * and its tiles go through the app's own OkHttp client, so a tile
 * through the gateway carries the session's cookie and every tile is
 * kept in the one cache (Gateway.client).
 */
class WingtipApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Gateway.attach(this)
        // First after the gateway, so a crash in anything after is caught;
        // its own work is off the main thread.
        Diagnostics.start(this)
        MapLibre.getInstance(this)
        HttpRequestUtil.setOkHttpClient(Gateway.client)
    }
}
