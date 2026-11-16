package app.wingtipmaps.android.notify

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import app.wingtipmaps.android.MainActivity
import app.wingtipmaps.android.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What the app tells the pilot while it is not in front -- an airplane
 * near own ship (Traffic), a watched airplane taking off or landing
 * (Tracking) -- and never for what the app is showing on its own screen,
 * where the banner or the amber mark says it. The twin of the iOS app's
 * Notifications.swift. iOS has a time-sensitive interruption level;
 * Android's nearest is a channel of high importance (a heads-up over
 * whatever is open) with the notification's category set, which the
 * system's Do Not Disturb rules read; there is no level an app may set
 * that passes a Focus by itself. The own-ship channel is low: Android
 * requires a notification for a foreground service, and that one is a
 * status, not news.
 *
 * Permission (POST_NOTIFICATIONS, Android 13 and later) is asked once,
 * in the moment the pilot first asks for one of these -- a watch set,
 * traffic near on the screen -- as the HIG and Android's own guidance
 * have it, not at launch. The models have no activity to ask through,
 * so `allow()` raises `wanted`, and the screen that sees it launches the
 * system's request (ActivityResultContracts.RequestPermission) and
 * answers through `answered`.
 */
object Notifications {
    const val CHANNEL_TRAFFIC = "traffic"
    const val CHANNEL_WATCHES = "watches"
    const val CHANNEL_OWN_SHIP = "own-ship"
    const val CHANNEL_ATC = "atc"

    /** The foreground service's notification id (OwnShipService). */
    const val OWN_SHIP_ID = 1

    /** The radio's listening service's notification id (AtcListenService). */
    const val ATC_ID = 2

    /** The cockpit receiver's service's notification id (ReceiverService). */
    const val RECEIVER_ID = 3

    private var asked = false
    private val _wanted = MutableStateFlow(false)

    /** True while the screen should ask the system for permission. */
    val wanted: StateFlow<Boolean> = _wanted.asStateFlow()

    /** The channels, made once per process (making one again is nothing);
     *  the names are what the pilot sees in the system's settings. */
    fun channels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_TRAFFIC, "Traffic near you", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "An airplane within a few miles and within 1,000 ft of your height"
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_WATCHES, "Watched airplanes", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "A watched airplane took off or landed"
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_OWN_SHIP, "Position in flight", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while your position is read with the screen off"
                setShowBadge(false)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ATC, "Listening to the radio", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while the ATC copilot listens for calls to your airplane"
                setShowBadge(false)
            },
        )
    }

    /** Whether the app may post: always before Android 13, the permission
     *  after it. */
    fun allowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** The system's request, once per launch at most (the system itself
     *  asks once per install): the pilot has just set a watch, or has
     *  traffic near on the screen. */
    fun allow() {
        if (asked) return
        asked = true
        _wanted.value = true
    }

    /** The screen's answer, whatever it was; the ask is not repeated. */
    fun answered() {
        _wanted.value = false
    }

    /** Whether the app is on the screen: what it shows there is not
     *  notified as well. */
    val inFront: Boolean
        get() = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)

    /** Told as a heads-up notification where the app is not in front;
     *  false where it is, or where the pilot has not allowed it, and the
     *  caller shows it on the screen instead. One id replaces an earlier
     *  notification of the same thing (the same airplane near again)
     *  rather than stacking them. */
    fun tell(context: Context, channel: String, title: String, body: String, id: String): Boolean {
        if (inFront) return false
        // The permission checked here, in the method that posts, so lint's
        // MissingPermission sees it beside the call it guards.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        channels(context)
        val category = if (channel == CHANNEL_TRAFFIC) NotificationCompat.CATEGORY_NAVIGATION else NotificationCompat.CATEGORY_STATUS
        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_wingtip)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(category)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openApp(context))
            .build()
        NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
        return true
    }

    /** The foreground service's notification: a status, with the app a
     *  tap away. Android requires one while the position is read with the
     *  app put away; its words say why. */
    fun ownShip(context: Context): Notification {
        channels(context)
        return NotificationCompat.Builder(context, CHANNEL_OWN_SHIP)
            .setSmallIcon(R.drawable.ic_stat_wingtip)
            .setContentTitle("Flying")
            .setContentText(context.getString(R.string.notify_own_ship_text))
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openApp(context))
            .build()
    }

    /** The ATC copilot's service's notification: a status, as own ship's,
     *  saying the microphone is in use and why. */
    fun atc(context: Context): Notification {
        channels(context)
        return NotificationCompat.Builder(context, CHANNEL_ATC)
            .setSmallIcon(R.drawable.ic_stat_wingtip)
            .setContentTitle("Listening to the Radio")
            .setContentText(context.getString(R.string.notify_atc_text))
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openApp(context))
            .build()
    }

    /** The cockpit receiver's service's notification: a status on own
     *  ship's low channel, saying what is heard. */
    fun receiver(context: Context): Notification {
        channels(context)
        return NotificationCompat.Builder(context, CHANNEL_OWN_SHIP)
            .setSmallIcon(R.drawable.ic_stat_wingtip)
            .setContentTitle("ADS-B Receiver")
            .setContentText(context.getString(R.string.notify_receiver_text))
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openApp(context))
            .build()
    }

    /** The app opened from a notification's tap. */
    internal fun openApp(context: Context): PendingIntent =
        PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
