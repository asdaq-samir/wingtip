package app.wingtipmaps.android.notify

import android.Manifest
import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnShipService

/**
 * The flight on the status bar while the phone is put away: Android 16's
 * Live Update, the iPhone's Live Activity's twin. The own-ship service's
 * notification (Android's required one while the position is read with
 * the screen off) becomes a promoted, ongoing progress notification --
 * the route as a bar with the airplane along it, the next point and the
 * minutes to it, the miles, time and fuel still to go -- with a chip in
 * the status bar giving the minutes to the next point. Below Android 16
 * it is the same notification as an ordinary ongoing one with a plain
 * progress bar (NotificationCompat's ProgressStyle falls back).
 *
 * Fed from the fix as InFlight takes it, so it goes on with the app put
 * away; posted only while the service is running (its notification is
 * removed with it), at most every UPDATE_EVERY_MS unless the next point
 * changes.
 */
object LiveFlight {
    /** How often the notification is changed at most, but for a new next
     *  point: Android rate-limits an app's updates, and the minutes to go
     *  change slowly. */
    const val UPDATE_EVERY_MS = 5_000L

    /** The progress bar's steps: a tenth of a percent. */
    private const val STEPS = 1000

    private var last: FlightUpdate? = null

    /** The flight as it stands after a fix: posted where it is due. */
    fun took(context: Context, state: InFlight.State, plan: Plan.State, nowMs: Long = System.currentTimeMillis()) {
        val update = FlightUpdate.of(
            progress = state.progress, underway = state.underway, dep = plan.dep, dest = plan.dest,
            airplaneChosen = plan.airplane, usableFuelGal = plan.totals?.usableFuelGal, nowMs = nowMs,
        )
        if (update == null) {
            last = null
            return
        }
        // Under way with notifications not allowed: asked once, where the
        // screen sees it (Notifications.allow, OwnShipControl).
        if (!Notifications.allowed(context)) {
            Notifications.allow()
            return
        }
        if (!OwnShipService.running || !FlightUpdate.due(update, last, UPDATE_EVERY_MS)) return
        last = update
        post(context, notification(context, update))
    }

    /** The Live Update's notification for `update`, on the own-ship
     *  channel and in its id's place. */
    fun notification(context: Context, update: FlightUpdate): Notification {
        Notifications.channels(context)
        val mark = IconCompat.createWithResource(context, R.drawable.ic_stat_wingtip)
        val style = NotificationCompat.ProgressStyle()
            .setStyledByProgress(true)
            .setProgressSegments(listOf(NotificationCompat.ProgressStyle.Segment(STEPS).setColor(Tint)))
            .setProgress(update.progress(STEPS))
            .setProgressTrackerIcon(mark)
        return NotificationCompat.Builder(context, Notifications.CHANNEL_OWN_SHIP)
            .setSmallIcon(R.drawable.ic_stat_wingtip)
            .setContentTitle(update.title)
            .setContentText(update.text)
            .setSubText(update.route)
            .setShortCriticalText(update.chip)
            .setStyle(style)
            .setColor(Tint)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setRequestPromotedOngoing(true)
            .setWhen(update.atMs)
            .setContentIntent(Notifications.openApp(context))
            .build()
    }

    // The permission is checked in took() before this is reached, and
    // again here so lint's MissingPermission sees it beside the call.
    private fun post(context: Context, notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        NotificationManagerCompat.from(context).notify(Notifications.OWN_SHIP_ID, notification)
    }

    /** The brand's tint, the notification's accent and the bar's colour. */
    private val Tint = WingtipPalettes.Light.primary.toArgb()
}
