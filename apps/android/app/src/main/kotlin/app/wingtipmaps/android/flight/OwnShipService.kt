package app.wingtipmaps.android.flight

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import app.wingtipmaps.android.notify.Notifications

/**
 * The foreground service that keeps the process alive while the airplane
 * is flying, from the pilot's Start Flight (StartFlightAsk) until it slows
 * below flying speed, so the fixes go on with the screen off (the manifest's
 * foregroundServiceType="location"). It reads nothing itself: OwnShip's
 * callback runs in this process whether or not an activity is shown, and
 * the service is only Android's reason not to end it. Its notification
 * is the one Android requires, on the low channel.
 */
class OwnShipService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        running = true
        val notification = Notifications.ownShip(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, Notifications.OWN_SHIP_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(Notifications.OWN_SHIP_ID, notification)
        }
        // Not restarted by the system once stopped: a flight the system
        // ended is not resumed on the ground.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        /** Whether the service is up, so its notification may be changed
         *  in place (LiveFlight's Live Update) and is never posted again
         *  once the service has gone with it. Main thread only. */
        var running = false
            private set
    }
}
