package app.wingtipmaps.android.account

import android.app.Application
import android.content.Context
import androidx.glance.appwidget.updateAll
import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.checklist.ChecklistStore
import app.wingtipmaps.android.flight.FlightSession
import app.wingtipmaps.android.logbook.FlightRecorder
import app.wingtipmaps.android.pilot.MinimumsStore
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.KeptPlan
import app.wingtipmaps.android.records.Records
import app.wingtipmaps.android.widget.FlightSnapshot
import app.wingtipmaps.android.widget.NextFlightWidget
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Everything the phone keeps of the pilot, forgotten at sign-out and when
 * the account is deleted (the store audit's P7: Android cleared only the
 * checklists and the kept plan, while the privacy policy says Delete
 * Account "clears the app's settings on the device you use" and the
 * inventory that the pilot's records are forgotten on sign-out). The
 * parts: the checklists, the plan kept for the next launch, the Room
 * records (kept airplanes, watches, planned routes), the path flown and
 * the flight recorded (own-trail.json, flight-recorded.json), the last
 * position, the pilot's own airplanes' figures, their minimums, the Next
 * Flight widget's snapshot, and the session's cookies, last. The public
 * aviation data kept for the air (KeptForAir, the cycle packs, the
 * charts) is nobody's and stays.
 *
 * Each part is forgotten whatever another's failure, so one store that
 * cannot be written never leaves the rest behind.
 */
class PhoneWipe(private val parts: List<Pair<String, suspend () -> Unit>>) {
    /** Every part forgotten, off the main thread; the names of any that failed. */
    suspend fun run(): List<String> = withContext(Dispatchers.IO) {
        parts.mapNotNull { (name, forget) ->
            try {
                forget()
                null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log.log(Level.WARNING, "The $name could not be forgotten", e)
                name
            }
        }
    }

    companion object {
        private val log = Logger.getLogger("Wingtip")

        fun of(context: Context, flight: FlightSession): PhoneWipe {
            val app = context.applicationContext
            return PhoneWipe(
                listOf(
                    "checklists" to { ChecklistStore.of(app).forgetAll() },
                    "kept plan" to { KeptPlan(app as Application).clear() },
                    "records" to { Records.database(app).erase() },
                    "path flown" to { flight.trail.wipe() },
                    "flight recorded" to { FlightRecorder.of(app).wipe() },
                    "last position" to { flight.ownShip.forgetLastPosition() },
                    "own airplanes" to { OwnAirplanes.of(app).forget() },
                    "minimums" to { MinimumsStore.of(app).forget() },
                    // The pilot's home airport, as the web's forgetPilot drops it.
                    "home airport" to { FlightChoices.of(app).setHome(null) },
                    "widget" to {
                        if (FlightSnapshot.write(app, null)) NextFlightWidget().updateAll(app)
                    },
                    // Last: the gateway's sign-out, before this, needed them.
                    "cookies" to { Gateway.cookies.clear() },
                ),
            )
        }
    }
}
