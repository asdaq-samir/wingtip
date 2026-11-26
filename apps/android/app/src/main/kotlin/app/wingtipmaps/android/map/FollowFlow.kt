package app.wingtipmaps.android.map

import android.view.View
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import org.maplibre.android.maps.MapView

/**
 * Draws a layer again whenever its flow changes, while its view is on the
 * window, and once when a style is set anew: the one place the map's
 * layers that follow their own flow keep their scope and their job.
 */
fun <T> MapView.followFlow(flow: Flow<T>, current: () -> T, redraw: (T) -> Unit) {
    var scope: CoroutineScope? = null
    var job: Job? = null
    addOnDidFinishLoadingStyleListener { redraw(current()) }
    addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
        override fun onViewAttachedToWindow(v: View) {
            val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
            scope = s
            job = s.launch { flow.collect { redraw(it) } }
        }

        override fun onViewDetachedFromWindow(v: View) {
            job?.cancel()
            scope?.cancel()
        }
    })
}
