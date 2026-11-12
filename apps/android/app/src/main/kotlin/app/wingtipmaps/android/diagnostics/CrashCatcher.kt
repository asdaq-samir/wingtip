package app.wingtipmaps.android.diagnostics

import app.wingtipmaps.android.AppClock
import java.io.File
import java.time.Instant

/**
 * A crash in the app's own code, written down as it happens: the
 * throwable's class, message and stack in a small file of the app's
 * no-backup folder, then handed on to the handler that was there before
 * (Android's, which ends the process and shows its dialog), so nothing of
 * the crash's ordinary course changes. The next start sends it as a
 * "crash" fault and deletes it. Only a file write runs in the handler: the
 * process is going, and a network call there would not finish.
 */
object CrashCatcher {
    const val FILE_NAME = "last-crash.txt"

    fun install(folder: File) {
        val file = File(folder, FILE_NAME)
        val before = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            val _ = runCatching { file.writeText(write(error, AppClock.javaNow())) }
            before?.uncaughtException(thread, error)
        }
    }

    /** The crash kept from the last run, and its file to delete once it
     *  is sent; null where the last run did not crash. */
    fun kept(folder: File): Pair<Fault, File>? {
        val file = File(folder, FILE_NAME)
        if (!file.exists()) return null
        val fault = runCatching { read(file.readText()) }.getOrNull()
        if (fault == null) {
            file.delete()
            return null
        }
        return fault to file
    }

    /** The file's text: when, then the signature, then the stack. */
    fun write(error: Throwable, at: Instant): String =
        "$at\n${signatureOf(error)}\n${error.stackTraceToString().take(DiagnosticsBodies.MAX_DETAIL)}"

    fun read(text: String): Fault? {
        val lines = text.split('\n', limit = 3)
        if (lines.size < 2) return null
        val at = runCatching { Instant.parse(lines[0].trim()) }.getOrNull() ?: return null
        return Fault("crash", lines[1], lines.getOrElse(2) { "" }, at.toString())
    }

    /** The one line the server groups crashes by: the throwable's class
     *  and its message's first line. */
    fun signatureOf(error: Throwable): String {
        val message = error.message?.lineSequence()?.firstOrNull()?.trim().orEmpty()
        return if (message.isEmpty()) error.javaClass.name else "${error.javaClass.name}: $message"
    }
}
