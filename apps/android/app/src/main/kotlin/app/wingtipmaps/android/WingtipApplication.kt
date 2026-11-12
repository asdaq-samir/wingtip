package app.wingtipmaps.android

import android.app.Application
import app.wingtipmaps.android.ai.OnPhoneAsk
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.diagnostics.Diagnostics
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.offline.KeptForAir
import dagger.hilt.android.HiltAndroidApp
import org.maplibre.android.MapLibre
import org.maplibre.android.module.http.HttpRequestUtil

/**
 * The process: nothing heavy is made here, only what must exist before
 * the first screen. MapLibre wants its instance made before any MapView,
 * and its tiles go through the app's own OkHttp client, so a tile
 * through the gateway carries the session's cookie and every tile is
 * kept in the one cache (Gateway.client). Hilt's component lives here
 * (HiltAndroidApp): the view models the screens ask for are its own.
 */
@HiltAndroidApp
class WingtipApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Gateway.attach(this)
        // First after the gateway, so a crash in anything after is caught;
        // its own work is off the main thread.
        Diagnostics.start(this)
        // The answers kept for the air (KeptForAir), where every screen's
        // model can reach them: only a folder's name, nothing read yet.
        KeptForAir.of(this)
        // The cycle packs' store, for the models that read them with no
        // planner (PhoneFields): a folder's name, nothing read yet.
        CyclePacks.of(this)
        // Ask on the phone (Gemini Nano with the app's own tools): only the
        // application kept, nothing asked of AICore until Ask is used.
        OnPhoneAsk.attach(this)
        // The IFR alternate filed last: one preference read, for the plan.
        PlanAlternate.attach(this)
        MapLibre.getInstance(this)
        HttpRequestUtil.setOkHttpClient(Gateway.client)
    }
}
