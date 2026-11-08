package app.wingtipmaps.android

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore

/** The app's settings file (Jetpack DataStore), for the switches the map
 *  and the flight pieces keep: traffic (Traffic's TrafficSwitch) and what
 *  the map draws (map/MapLayers). One delegate for the file, as DataStore
 *  allows one store a file in a process. */
val Context.settings: DataStore<Preferences> by preferencesDataStore(name = "settings")
