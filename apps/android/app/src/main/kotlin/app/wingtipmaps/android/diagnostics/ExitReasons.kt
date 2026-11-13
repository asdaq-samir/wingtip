package app.wingtipmaps.android.diagnostics

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import app.wingtipmaps.android.api.generated.gateway.FaultReport
import java.time.Instant

/**
 * How the app's process ended the last few times, as Android 11 and later
 * keep it (ActivityManager.getHistoricalProcessExitReasons): the crashes,
 * the hangs Android stopped (ANR) and the exits it forced for memory or
 * resources, as faults. The ordinary ends -- the pilot swiping the app
 * away, an update, a permission changed, Android freeing a background
 * process -- are not faults and are passed over. A crash in Kotlin is
 * CrashCatcher's too, with its stack; this has the native ones and the
 * hangs, which no handler in the app sees.
 */
object ExitReasons {
    /** The fault kind of an exit reason, or null for an ordinary end. */
    fun kindOf(reason: Int): String? = when (reason) {
        ApplicationExitInfo.REASON_CRASH, ApplicationExitInfo.REASON_CRASH_NATIVE -> "crash"
        ApplicationExitInfo.REASON_ANR -> "hang"
        ApplicationExitInfo.REASON_LOW_MEMORY,
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE,
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "exit"
        else -> null
    }

    /** The reason's name, the signature's first word. */
    fun nameOf(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_CRASH -> "crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native crash"
        ApplicationExitInfo.REASON_ANR -> "ANR"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low memory"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "excessive resource use"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "initialization failure"
        else -> "exit $reason"
    }

    /** One exit as a fault, or null where it is an ordinary end, no
     *  newer than the last one reported, or a Kotlin crash CrashCatcher
     *  has already written down with its stack (`caught`). */
    fun fault(reason: Int, description: String?, timestampMs: Long, trace: String?, reportedUpToMs: Long, caught: Boolean = false): FaultReport? {
        if (timestampMs <= reportedUpToMs) return null
        if (caught && reason == ApplicationExitInfo.REASON_CRASH) return null
        val kind = kindOf(reason) ?: return null
        val signature = listOfNotNull(nameOf(reason), description?.takeIf { it.isNotBlank() }).joinToString(": ")
        return FaultReport(
            kind = kind,
            signature = signature,
            detail = trace.orEmpty().take(DiagnosticsBodies.MAX_DETAIL),
            at = Instant.ofEpochMilli(timestampMs).toString(),
        )
    }

    /** The exits since the last reported, oldest first, and the newest
     *  one's time to keep once they are sent. Nothing below Android 11. */
    fun since(context: Context, reportedUpToMs: Long, caught: Boolean): Pair<List<FaultReport>, Long> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return emptyList<FaultReport>() to reportedUpToMs
        return read(context, reportedUpToMs, caught)
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun read(context: Context, reportedUpToMs: Long, caught: Boolean): Pair<List<FaultReport>, Long> {
        val manager = context.getSystemService(ActivityManager::class.java) ?: return emptyList<FaultReport>() to reportedUpToMs
        val exits = runCatching { manager.getHistoricalProcessExitReasons(context.packageName, 0, 10) }.getOrDefault(emptyList())
        val faults = exits.sortedBy { it.timestamp }.mapNotNull { exit ->
            fault(exit.reason, exit.description, exit.timestamp, traceOf(exit), reportedUpToMs, caught)
        }
        val newest = exits.maxOfOrNull { it.timestamp } ?: reportedUpToMs
        return faults to maxOf(newest, reportedUpToMs)
    }

    /** The hang's thread dump, which Android keeps as text. A native
     *  crash's trace is a tombstone in protobuf (Android 12 and later),
     *  not text, so it is left out: its signature still says what died. */
    @RequiresApi(Build.VERSION_CODES.R)
    private fun traceOf(exit: ApplicationExitInfo): String? {
        if (exit.reason != ApplicationExitInfo.REASON_ANR) return null
        return runCatching {
            exit.traceInputStream?.bufferedReader()?.use { reader ->
                val out = CharArray(DiagnosticsBodies.MAX_DETAIL)
                var n = 0
                while (n < out.size) {
                    val read = reader.read(out, n, out.size - n)
                    if (read < 0) break
                    n += read
                }
                String(out, 0, n)
            }
        }.getOrNull()
    }
}
