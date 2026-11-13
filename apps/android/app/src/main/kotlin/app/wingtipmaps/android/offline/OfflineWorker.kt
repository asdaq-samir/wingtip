package app.wingtipmaps.android.offline

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.wingtipmaps.android.api.Gateway
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.CacheControl
import okhttp3.Request
import okhttp3.coroutines.executeAsync
import java.io.File
import java.io.FileOutputStream

/**
 * One archive of a region fetched by WorkManager, so a download of
 * hundreds of megabytes carries on with the app in the background or
 * closed, and after a restart. Fetched into a `.part` file beside its
 * place and resumed from its length with a Range (the planner answers
 * 206, Starlette's FileResponse): WorkManager stops a worker after ten
 * minutes, and the next run picks up where it was rather than starting
 * again. The progress is the bytes written and expected.
 */
class OfflineWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val cycle = inputData.getString(CYCLE) ?: return@withContext Result.failure()
        val region = inputData.getString(REGION) ?: return@withContext Result.failure()
        val archive = inputData.getString(ARCHIVE) ?: return@withContext Result.failure()
        val url = inputData.getString(URL) ?: return@withContext Result.failure()
        val expected = inputData.getLong(BYTES, -1)
        val store = OfflineStore.of(applicationContext)
        val part = File(store.path(cycle, region, archive).path + ".part").apply { parentFile?.mkdirs() }
        val from = if (part.isFile) part.length() else 0L
        val request = Request.Builder().url(url).cacheControl(CacheControl.Builder().noStore().build())
            .apply { if (from > 0) header("Range", "bytes=$from-") }.build()
        val outcome = runCatching {
            Gateway.streaming.newCall(request).executeAsync().use { response ->
                val append = from > 0 && response.code == 206
                if (response.code != 200 && !append) error("the planner answered ${response.code}")
                val body = response.body
                // -1 where the server gave no length: the size asked for then.
                val length = body.contentLength().takeIf { it >= 0 }
                val total = if (append) from + (length ?: 0) else length ?: expected
                FileOutputStream(part, append).use { out ->
                    val input = body.byteStream()
                    val buffer = ByteArray(1 shl 16)
                    var written = if (append) from else 0L
                    var told = 0L
                    while (true) {
                        if (isStopped) return@runCatching false
                        val n = input.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                        written += n
                        if (written - told > (1L shl 20)) {
                            told = written
                            setProgress(workDataOf(WRITTEN to written, EXPECTED to total))
                        }
                    }
                }
                true
            }
        }
        when {
            outcome.isFailure -> {
                if (runAttemptCount >= 4) {
                    store.update("$cycle/$region") { it?.copy(failed = outcome.exceptionOrNull()?.message) }
                    Result.failure()
                } else Result.retry()
            }
            outcome.getOrNull() == false -> Result.retry()
            expected > 0 && part.length() != expected -> {
                // Not what the planner listed: a cut changed under it. Again, whole.
                part.delete()
                Result.retry()
            }
            else -> {
                store.finish(cycle, region, archive, part)
                Result.success()
            }
        }
    }

    companion object {
        const val CYCLE = "cycle"
        const val REGION = "region"
        const val ARCHIVE = "archive"
        const val URL = "url"
        const val BYTES = "bytes"
        const val WRITTEN = "written"
        const val EXPECTED = "expected"
        /** Every download's tag, for the list to follow them all. */
        const val TAG = "offline-charts"

        fun name(cycle: String, region: String, archive: String) = "offline:$cycle/$region/$archive"

        /** An archive queued, once: one already queued or running is kept. */
        fun enqueue(context: Context, cycle: String, region: String, archive: String, url: String, bytes: Long) {
            val request = OneTimeWorkRequestBuilder<OfflineWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf(CYCLE to cycle, REGION to region, ARCHIVE to archive, URL to url, BYTES to bytes))
                .addTag(TAG).addTag("$TAG:$cycle/$region")
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(name(cycle, region, archive), ExistingWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context, cycle: String, region: String) {
            WorkManager.getInstance(context).cancelAllWorkByTag("$TAG:$cycle/$region")
        }
    }
}
