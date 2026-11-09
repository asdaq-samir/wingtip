package app.wingtipmaps.android.receiver

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import app.wingtipmaps.android.notify.Notifications

/**
 * The foreground service that keeps the process alive while a cockpit
 * receiver is heard, so its traffic and weather keep coming with the
 * screen off (the manifest's foregroundServiceType="connectedDevice": the
 * receiver is a device the phone is connected to over the Wi-Fi). It reads
 * nothing itself: Receiver's socket and clock run in this process, and the
 * service is only Android's reason not to end it. Started and stopped by
 * Receiver as the receiver is heard and goes quiet.
 */
class ReceiverService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = Notifications.receiver(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, Notifications.RECEIVER_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(Notifications.RECEIVER_ID, notification)
        }
        // Not restarted by the system once stopped: Receiver starts it
        // again when the receiver is next heard.
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
