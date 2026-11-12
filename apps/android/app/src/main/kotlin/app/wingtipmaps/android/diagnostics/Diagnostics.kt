package app.wingtipmaps.android.diagnostics

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The app's diagnostics, started once from WingtipApplication: the crash
 * catcher at once, then off the main thread the faults since the last
 * report (the last run's crash, the exits Android kept) sent, and each
 * session's frames and launch sent as the app goes to the background.
 * The same report the iPhone and the web send; nothing of the pilot's is
 * in any of it (DiagnosticsBody).
 */
object Diagnostics {
    private const val PREFS = "diagnostics"
    private val EXITS_UP_TO = longPreferencesKey("exits_up_to")

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val frames = FrameStats()

    fun start(app: Application) {
        CrashCatcher.install(app.noBackupFilesDir)
        scope.launch { val _ = runCatching { sendFaults(app) } }
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) = frames.started(activity)
            override fun onActivityStopped(activity: Activity) = frames.stopped()
            override fun onActivityDestroyed(activity: Activity) = frames.destroyed()
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        })
        // The whole app in the background, not one activity behind
        // another (a picker over it): the session's end.
        ProcessLifecycleOwner.get().lifecycle.addObserver(LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                val figures = frames.take()
                if (figures.isNotEmpty()) scope.launch { val _ = runCatching { DiagnosticsReporter.send(app, emptyList(), figures) } }
            }
        })
    }

    /** The last run's crash and the exits since the last report; each
     *  marked sent only once the gateway has taken them, so a report lost
     *  with no connection is tried again next start. */
    private suspend fun sendFaults(context: Context) {
        val prefs = Kept.of(context, PREFS)
        val crash = CrashCatcher.kept(context.noBackupFilesDir)
        val (exits, upTo) = ExitReasons.since(context, prefs[EXITS_UP_TO] ?: 0L, caught = crash != null)
        val faults = listOfNotNull(crash?.first) + exits
        if (faults.isNotEmpty() && !DiagnosticsReporter.send(context, faults, emptyMap())) return
        crash?.second?.delete()
        prefs.edit { it[EXITS_UP_TO] = upTo }
    }
}
