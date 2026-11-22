package app.wingtipmaps.android.library

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
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.CfrText
import app.wingtipmaps.android.api.libraryPdf
import app.wingtipmaps.android.api.libraryText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * One book of the FAA's shelf kept for the air by WorkManager, so a
 * handbook of tens of megabytes carries on with the app in the background
 * or closed: Keep for the Air, and a new edition kept in an old one's
 * place (Bookshelf.refresh). Each is written beside its place and moved
 * there whole, only then is the old edition deleted, so the phone never
 * holds half a book or none while a new one comes. One per document
 * (unique work by its id), on any network, as the web's Keep for the Air
 * fetches on whatever the browser has.
 */
class KeepBookWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val doc = inputData.getString(DOC) ?: return@withContext Result.failure()
        val edition = inputData.getString(EDITION) ?: return@withContext Result.failure()
        val kind = inputData.getString(KIND) ?: return@withContext Result.failure()
        val shelf = Bookshelf.of(applicationContext)
        val file = shelf.file(doc, edition, kind)
        val part = File(file.path + ".part").apply { parentFile?.mkdirs() }
        val outcome = runCatching {
            if (kind == Bookshelf.TEXT) {
                part.writeText(Gateway.json.encodeToString(CfrText.serializer(), Planner.libraryText(doc, edition)))
                true
            } else {
                Planner.libraryPdf(doc, edition, part, told = { w, t -> setProgress(workDataOf(WRITTEN to w, EXPECTED to t)) }, stopped = { isStopped })
            }
        }
        when {
            outcome.isFailure -> {
                part.delete()
                if (runAttemptCount >= 3) Result.failure() else Result.retry()
            }
            outcome.getOrNull() == false || isStopped || !part.renameTo(file) -> Result.retry()
            else -> {
                shelf.kept(doc, file)
                Result.success()
            }
        }
    }

    companion object {
        private const val DOC = "doc"
        private const val EDITION = "edition"
        private const val KIND = "kind"
        const val WRITTEN = "written"
        const val EXPECTED = "expected"

        /** Every book's tag, for the page to follow them all. */
        const val TAG = "library-book"

        private fun name(doc: String) = "$TAG:$doc"

        /** The document's id a book's work carries in its tags. */
        fun docOf(tags: Set<String>): String? = tags.firstOrNull { it.startsWith("$TAG:") }?.removePrefix("$TAG:")

        /** The book kept in `edition`, once: one already queued or under
         *  way is left to run, and the next shelf read keeps a newer one. */
        fun keep(context: Context, doc: String, edition: String, kind: String) {
            val request = OneTimeWorkRequestBuilder<KeepBookWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf(DOC to doc, EDITION to edition, KIND to kind))
                .addTag(TAG).addTag(name(doc))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(name(doc), ExistingWorkPolicy.KEEP, request)
        }

        fun stop(context: Context, doc: String) {
            WorkManager.getInstance(context).cancelUniqueWork(name(doc))
        }
    }
}
