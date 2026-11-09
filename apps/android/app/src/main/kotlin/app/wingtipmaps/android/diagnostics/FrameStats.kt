package app.wingtipmaps.android.diagnostics

import android.app.Activity
import android.os.Process
import android.os.SystemClock
import androidx.core.view.OneShotPreDrawListener
import androidx.metrics.performance.JankStats
import java.util.concurrent.atomic.AtomicLong

/**
 * The session's speed as the pilot felt it: the frames the activity drew
 * and how many JankStats judged janky (later than the display's frame
 * time allows, by its own heuristic), and the launch, from the process
 * starting to the first frame being drawn. Taken once a session, as the
 * app goes to the background, and counted afresh after.
 */
class FrameStats {
    private val frames = AtomicLong()
    private val janky = AtomicLong()
    private val launchMs = AtomicLong(-1)
    private var tracker: JankStats? = null
    private var launchSeen = false

    /** The activity's window watched, and the launch timed on its first
     *  start in this process. JankStats calls back off the main thread,
     *  hence the atomic counts. */
    fun started(activity: Activity) {
        val decor = activity.window.decorView
        if (tracker == null) {
            tracker = JankStats.createAndTrack(activity.window) { frame ->
                frames.incrementAndGet()
                if (frame.isJank) janky.incrementAndGet()
            }
        }
        tracker?.isTrackingEnabled = true
        if (!launchSeen) {
            launchSeen = true
            // The frame is drawn just after its pre-draw pass; the post
            // runs once that frame's traversal is done.
            OneShotPreDrawListener.add(decor) {
                decor.post { launched(SystemClock.uptimeMillis() - Process.getStartUptimeMillis()) }
            }
        }
    }

    fun stopped() {
        tracker?.isTrackingEnabled = false
    }

    /** The activity gone: its window's tracker with it. */
    fun destroyed() {
        tracker = null
    }

    private fun launched(ms: Long) {
        // A process started for something else first (a notification's
        // service) and opened much later is not a launch to time.
        if (ms in 0..MAX_LAUNCH_MS) launchMs.set(ms)
    }

    /** The session's figures, and the counts started again. */
    fun take(): Map<String, Double> = figures(frames.getAndSet(0), janky.getAndSet(0), launchMs.getAndSet(-1).takeIf { it >= 0 })

    companion object {
        const val MAX_LAUNCH_MS = 60_000L

        /** The figures as the gateway's speed trend takes them; none
         *  where nothing was drawn. */
        fun figures(frames: Long, janky: Long, launchMs: Long?): Map<String, Double> = buildMap {
            if (frames > 0) {
                put("frames", frames.toDouble())
                put("janky_frames", janky.toDouble())
                put("jank_ratio", janky.toDouble() / frames)
            }
            launchMs?.let { put("launch_ms", it.toDouble()) }
        }
    }
}
