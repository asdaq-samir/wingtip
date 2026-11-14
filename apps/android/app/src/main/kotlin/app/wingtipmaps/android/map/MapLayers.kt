package app.wingtipmaps.android.map

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import app.wingtipmaps.android.plates.PlateLookStore
import app.wingtipmaps.android.settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * What the map draws, the web's Map card (lib/prefs/mapSlice, the owner,
 * 2026-11-14: "I want to keep it simple though. can we just have four
 * layers aeronautical, weather, traffic, private/military in the map
 * settings?"; "chart should also have none option"), with the web's
 * defaults:
 *
 * - `chart`: the FAA chart drawn, or none -- a plain ground in the look's
 *   colours with every vector layer over it;
 * - `tac`: the terminal area chart pinned over the sectional, off, a switch
 *   under the chart while there is one;
 * - `aeronautical`: the Class B, C and D and the special use areas, the
 *   VORs, fixes and VFR waypoints, on;
 * - `weather`: the fields' weather marks (Settings' Airport Weather says
 *   how), the radar and satellite loop and the model weather picked in
 *   the Weather tile's menu, on;
 * - `privateMilitary`: the private fields (landed at only with the
 *   owner's leave, NASR APT_BASE facility use PR) and the armed services'
 *   own, off. A joint-use field is drawn either way.
 *
 * Traffic is its own switch (TrafficSwitch). The public fields, the route
 * and its points, own ship and the TFRs have none: always drawn.
 */
data class MapLayers(
    val chart: Boolean = true,
    val tac: Boolean = false,
    val aeronautical: Boolean = true,
    val weather: Boolean = true,
    val privateMilitary: Boolean = false,
) {
    /**
     * What the chart draws while the emergency assistant is open: every
     * private and military field too, whatever the switch says, since in
     * an emergency the pilot may land at any of them (14 CFR 91.3(b)) and
     * the assistant's list ranks them (the owner, 2026-11-13). The switch
     * itself is not touched, so it is as the pilot left it once it closes.
     */
    fun duringEmergency(open: Boolean): MapLayers = if (open) copy(privateMilitary = true) else this
}

/**
 * The map's switches kept in the app's settings file, each under its own
 * key, so a choice holds across launches; read once, a choice made before
 * the read lands winning, as TrafficSwitch does. The first read after the
 * four layers came folds the old switches in (folded). Its own small
 * piece so its wiring is tested on a plain DataStore.
 */
class MapLayersStore(
    private val store: DataStore<Preferences>,
    private val scope: CoroutineScope,
    private val onFolded: () -> Unit = {},
) {
    /** One of the switches, by its key in the file. */
    enum class Switch(val key: Preferences.Key<Boolean>) {
        CHART(booleanPreferencesKey("map_chart")),
        TAC(booleanPreferencesKey("map_tac")),
        AERONAUTICAL(booleanPreferencesKey("map_aeronautical")),
        WEATHER(booleanPreferencesKey("map_weather")),
        PRIVATE_MILITARY(booleanPreferencesKey("map_private_military")),
    }

    private val _layers = MutableStateFlow(MapLayers())
    val layers: StateFlow<MapLayers> = _layers.asStateFlow()

    /** The switches set before the kept values were read, which the read
     *  leaves as the pilot set them. */
    private val touched = HashSet<Switch>()

    val loaded: Job = scope.launch {
        val kept = store.data.first()
        val old = OLD.mapValues { (_, key) -> kept[key] }
        val fold = kept[Switch.AERONAUTICAL.key] == null && old.values.any { it != null }
        val values = Switch.entries.associateWith { kept[it.key] } + if (fold) folded(old) else emptyMap()
        _layers.update { now ->
            values.entries.fold(now) { acc, (s, value) -> if (value == null || s in touched) acc else turned(acc, s, value) }
        }
        if (fold) {
            store.edit { file ->
                folded(old).forEach { (s, v) -> if (s !in touched) file[s.key] = v }
                OLD.values.forEach { file.remove(it) }
            }
            onFolded()
        }
    }

    /** A switch turned on or off now and kept; the write's job. */
    fun set(switch: Switch, on: Boolean): Job {
        touched += switch
        _layers.update { turned(it, switch, on) }
        return scope.launch { store.edit { it[switch.key] = on } }
    }

    companion object {
        /** The Map card's switches before its four layers (2026-11-14). */
        private val OLD: Map<String, Preferences.Key<Boolean>> = listOf("airspace", "navaids", "private_fields", "military")
            .associateWith { booleanPreferencesKey("map_$it") }

        /**
         * The old switches folded into the four layers, each group on where
         * any of its old layers was on, so a pilot's choices carry over (the
         * web's preferences version 10): a switch never kept was at its
         * default then (the airspace and the VORs on). The fields' weather
         * marks were drawn unless Settings' Airport Weather was Off, so
         * Weather is left at its default, on, and Airport Weather still
         * says how.
         */
        fun folded(old: Map<String, Boolean?>): Map<Switch, Boolean> = mapOf(
            Switch.AERONAUTICAL to ((old["airspace"] ?: true) || (old["navaids"] ?: true)),
            Switch.PRIVATE_MILITARY to (old["private_fields"] == true || old["military"] == true),
        )

        /** Whether the Weather layer is on, for the weather's own layers
         *  and bars to draw nothing while it is off (the web's Weather
         *  tile: the fields' marks, the loop and the model weather). */
        fun weatherOn(context: Context): Flow<Boolean> = of(context).layers.map { it.weather }.distinctUntilChanged()

        fun turned(layers: MapLayers, switch: Switch, on: Boolean): MapLayers = when (switch) {
            Switch.CHART -> layers.copy(chart = on)
            Switch.TAC -> layers.copy(tac = on)
            Switch.AERONAUTICAL -> layers.copy(aeronautical = on)
            Switch.WEATHER -> layers.copy(weather = on)
            Switch.PRIVATE_MILITARY -> layers.copy(privateMilitary = on)
        }

        @Volatile
        private var shared: MapLayersStore? = null

        /** The app's one store of the map's switches. The approach plates'
         *  own tile went with the four layers: a plate is laid on from its
         *  card and taken off there, so plates turned off by the old tile
         *  are drawn again once the switches are folded. */
        fun of(context: Context): MapLayersStore =
            shared ?: synchronized(this) {
                shared ?: MapLayersStore(
                    context.applicationContext.settings,
                    CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
                ) { PlateLookStore.of(context.applicationContext).setShown(true) }.also { shared = it }
            }
    }
}
