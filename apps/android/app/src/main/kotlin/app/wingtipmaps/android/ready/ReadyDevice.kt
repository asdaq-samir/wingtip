package app.wingtipmaps.android.ready

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.BatteryManager
import androidx.core.content.ContextCompat
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.offline.KeepForAir
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.offline.OfflineStore
import app.wingtipmaps.android.receiver.Receiver
import app.wingtipmaps.android.receiver.ReceiverMode

/**
 * What the phone says of itself for ready_to_fly, read where the app
 * already keeps it: the charts of Setup → Downloads (OfflineStore), the
 * cycle packs kept along the route (CyclePacks), the battery
 * (BatteryManager), the location permission, the plan kept for the next
 * launch (Plan.saved), the ADS-B receiver (Receiver) and what Keep for
 * the Air holds for the route (KeepForAir). Facts only; the
 * engine judges them. Run off the main thread: the packs' regions are
 * asked of the engine along the whole route.
 */
object ReadyDevice {
    fun local(context: Context, plan: Plan, briefAtMs: Long?): ReadyFacts.Local {
        val state = plan.state.value
        val line = state.course?.courseLine.orEmpty().filter { it.size == 2 }
        val battery = battery(context)
        return ReadyFacts.Local(
            charts = if (state.routed) charts(context, line) else null,
            packs = packs(context, line),
            briefAtMs = briefAtMs,
            device = EngineContract.ReadyToFlyInputDevice(
                batteryPct = battery?.first,
                charging = battery?.second,
                location = location(context),
                planSaved = if (state.routed) plan.saved() else null,
            ),
            receiver = receiver(context),
            kept = if (state.routed) KeepForAir.status(KeptForAir.of(context), state, plan.saved()) else null,
        )
    }

    /** The route's charts, every two nm along its line; the item left out
     *  where the line's points cannot be had (Engine.rule has logged why). */
    private fun charts(context: Context, line: List<List<Double>>): EngineContract.ReadyToFlyInputCharts? =
        CyclePacks.samples(line, everyNm = 2.0).getOrNull()?.let { ReadyFacts.charts(OfflineStore.of(context).kept.value, it) }

    /**
     * The cycle packs' edition: the NASR effective date the kept packs are
     * of ("YYYY-MM-DD", the planner's cycle_of), where the phone holds the
     * pack of every region the route crosses that the planner has one of;
     * none held otherwise. With no route, the cycle of whatever is kept.
     */
    private fun packs(context: Context, line: List<List<Double>>): EngineContract.ReadyToFlyInputPacks {
        val store = CyclePacks.of(context)
        val index = store.index ?: return EngineContract.ReadyToFlyInputPacks(edition = null, canUpdate = true)
        if (line.size < 2) return EngineContract.ReadyToFlyInputPacks(edition = index.cycle, canUpdate = true)
        val listed = index.regions.map { it.name }.toSet()
        // Where the engine cannot say which regions the route crosses,
        // nothing was checked: not held, so Ready to Fly says to download,
        // never passed on an unknown (the audit's AND-3).
        val wanted = CyclePacks.regions(line).getOrNull()?.filter { it in listed }
            ?: return EngineContract.ReadyToFlyInputPacks(edition = null, canUpdate = true)
        val whole = wanted.all { store.path(index.cycle, it).isFile }
        return EngineContract.ReadyToFlyInputPacks(edition = if (whole) index.cycle else null, canUpdate = true)
    }

    /** The charge in percent and whether it is charging; null where the
     *  system does not say. */
    private fun battery(context: Context): Pair<Double, Boolean>? {
        val manager = context.getSystemService(BatteryManager::class.java) ?: return null
        val pct = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (pct <= 0 || pct > 100) return null
        return pct.toDouble() to manager.isCharging
    }

    /** Granted where either location is allowed (approximate shows the
     *  dot too); otherwise "prompt", since the app can ask again. */
    private fun location(context: Context): String {
        val granted = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            .any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
        return if (granted) "granted" else "prompt"
    }

    /** A receiver only where the pilot flies with one: one heard since the
     *  app started (its Heartbeat), and whether it is heard now. None
     *  heard is no receiver, and the item is left out. */
    private fun receiver(context: Context): EngineContract.ReadyToFlyInputReceiver? {
        val receiver = Receiver.of(context)
        if (receiver.mode.value != ReceiverMode.AUTO) return null
        val heard = receiver.picture.value?.receiver ?: return null
        if (heard.heartbeatAt == null) return null
        return EngineContract.ReadyToFlyInputReceiver(used = true, connected = heard.live)
    }
}
