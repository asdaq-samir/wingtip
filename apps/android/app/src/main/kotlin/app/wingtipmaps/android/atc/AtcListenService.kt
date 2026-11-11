package app.wingtipmaps.android.atc

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.wingtipmaps.android.notify.Notifications

/**
 * The foreground service that keeps the radio listened to with the screen
 * off (the manifest's foregroundServiceType="microphone"), as OwnShipService
 * keeps the position: it hears nothing itself, RadioListener does, and it
 * is only Android's reason not to end the process, with the notification
 * Android requires while the microphone is in use (Notifications.atc).
 */
class AtcListenService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = Notifications.atc(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ServiceCompat.startForeground(this, Notifications.ATC_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(Notifications.ATC_ID, notification)
        }
        // Not restarted by the system once stopped: the copilot starts it
        // again with the next flight.
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        /** On while listening, off otherwise. Android 12 and later refuse
         *  to start one from the background, and Android 14 a microphone
         *  one without the app in front: the listening goes on while the
         *  app is shown then, and the notification follows at the next. */
        fun keep(context: Context, on: Boolean) {
            val intent = Intent(context, AtcListenService::class.java)
            if (!on) {
                context.stopService(intent)
                return
            }
            try {
                ContextCompat.startForegroundService(context, intent)
            } catch (e: IllegalStateException) {
                // Started from the background: refused, kept listening in front.
            } catch (e: SecurityException) {
                // The microphone not allowed while in use: the same.
            }
        }
    }
}
