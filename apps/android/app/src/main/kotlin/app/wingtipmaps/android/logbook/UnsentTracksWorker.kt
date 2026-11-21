package app.wingtipmaps.android.logbook

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * The logged flights' tracks kept on the phone (UnsentTracks) sent by
 * WorkManager once there is a network, with the app in front, in the
 * background or closed, and after a restart: WorkManager's own network
 * constraint and backoff, in place of a network callback the app held
 * open only while it was in front. A track still unsent is tried again
 * on the backoff; one that went is let go by the shelf.
 */
class UnsentTracksWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val shelf = UnsentTracks.of(applicationContext)
        shelf.send(ServerLogbook::saveTrack)
        return if (shelf.unsent.value.isEmpty()) Result.success() else Result.retry()
    }

    companion object {
        private const val NAME = "tracks-unsent"

        /** The send asked for, once: one already waiting stands. */
        fun request(): OneTimeWorkRequest = OneTimeWorkRequestBuilder<UnsentTracksWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()

        fun enqueue(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, request())
        }
    }
}
