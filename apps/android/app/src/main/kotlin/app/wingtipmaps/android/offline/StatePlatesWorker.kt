package app.wingtipmaps.android.offline

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.wingtipmaps.android.AppClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * A state's plates fetched by WorkManager (StatePlates.keep), as a
 * region's charts are (OfflineWorker), so a state's thousand charts go on
 * with the app in the background or closed and after a restart; and,
 * with no state named, the check of the kept states: each whose cycle has
 * been replaced fetched again for the planner's new one, and each stopped
 * short gone on with. The check runs every hour while a state is kept and
 * once as the app starts, so an update comes within the hour of 0901Z.
 */
class StatePlatesWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val store = StatePlatesStore.of(applicationContext)
        val id = inputData.getString(STATE)
        val cycle = inputData.getString(CYCLE)
        if (id == null || cycle == null) {
            for ((state, at) in StatePlates.due(store, PlatesPlanner.Live, AppClock.javaNow())) enqueue(applicationContext, state, at)
            return@withContext Result.success()
        }
        val kept = KeptForAir.of(applicationContext)
        val listed = StatePlates.keep(
            store, ChartKeeper(kept), PlatesPlanner.Live, id, cycle,
            held = { StatePlates.held(store, kept, except = id) },
            progress = { done, charts -> setProgress(workDataOf(DONE to done, CHARTS to charts)) },
        )
        when {
            !listed && runAttemptCount < 3 -> Result.retry()
            else -> Result.success()
        }
    }

    companion object {
        const val STATE = "state"
        const val CYCLE = "cycle"
        const val DONE = "done"
        const val CHARTS = "charts"
        /** Every state's fetch's tag, for the list to follow them. */
        const val TAG = "state-plates"
        private const val CHECK = "state-plates-check"

        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** A state's fetch of a cycle queued, once: one already queued or
         *  running for that cycle is kept. */
        fun enqueue(context: Context, state: String, cycle: String) {
            val request = OneTimeWorkRequestBuilder<StatePlatesWorker>()
                .setConstraints(online)
                .setInputData(workDataOf(STATE to state, CYCLE to cycle))
                .addTag(TAG).addTag("$TAG:$state")
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("plates:$state@$cycle", ExistingWorkPolicy.KEEP, request)
            watch(context)
        }

        /** The hourly check, while any state is kept. */
        fun watch(context: Context) {
            val request = PeriodicWorkRequestBuilder<StatePlatesWorker>(1, TimeUnit.HOURS).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(CHECK, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        /** As the app starts, where a state is kept (its record on disk): the
         *  check once now. Nothing read on the main thread. */
        fun atStart(context: Context) {
            if (!StatePlatesStore.dir(context).isDirectory) return
            val request = OneTimeWorkRequestBuilder<StatePlatesWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork("$CHECK-now", ExistingWorkPolicy.KEEP, request)
            watch(context)
        }

        fun cancel(context: Context, state: String) {
            WorkManager.getInstance(context).cancelAllWorkByTag("$TAG:$state")
        }

        /** No state kept: the hourly check stopped. */
        fun unwatch(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(CHECK)
        }
    }
}
