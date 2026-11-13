package app.wingtipmaps.android.engine

import app.wingtipmaps.android.api.AirportPin
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.AirportsInView
import app.wingtipmaps.android.engine.generated.regionOf
import kotlinx.serialization.decodeFromString
import app.wingtipmaps.android.engine.ffi.airportsInView as packsAirports
import app.wingtipmaps.android.engine.ffi.airspaceInView as packsAirspace
import app.wingtipmaps.android.engine.ffi.navaidsInView as packsNavaids

// What the map draws, from the packs kept on the phone (the engine's view
// module through engine.ffi's airspaceInView, airportsInView and navaidsInView):
// the planner's own answers for /api/airspace/in-view,
// /api/airports/in-view and /api/navaids/in-view, worked out on the phone
// from the regions the pilot keeps, so a pan in flight with no signal
// still has its fields, rings and VORs. The twin of the iOS app's
// InView.swift. A field's live flight category is the planner's alone:
// null here. The map asks here first and the planner second (the iOS
// app's PackMapData); a region never kept, or no index yet, is null, and
// the planner's answer is then the one source.

/** The paths of the packs of every region the box touches; null where
 *  none of them was ever kept. */
private fun CyclePacks.packsInBox(south: Double, west: Double, north: Double, east: Double): List<String>? {
    if (index == null) return null
    // The regions are 4-degree squares (Engine.regionOf): every 2 degrees
    // across the box and its far edges names each one the box touches.
    val names = HashSet<String>()
    var lat = south
    while (lat <= north + 2) {
        var lon = west
        while (lon <= east + 2) {
            names += Engine.regionOf(minOf(lat, north), minOf(lon, east)).getOrThrow()
            lon += 2
        }
        lat += 2
    }
    val packs = packs(names)
    return if (packs.isEmpty()) null else packs
}

/** The fields in the box (AirportsInView), biggest first; null with no pack. */
fun CyclePacks.airportsInView(south: Double, west: Double, north: Double, east: Double): List<AirportPin>? {
    val packs = packsInBox(south, west, north, east) ?: return null
    val json = packsAirports(packs, south, west, north, east)
    return runCatching { Gateway.json.decodeFromString<AirportsInView>(json) }.getOrNull()?.airports
}

/** The Class B, C, D and surface E volumes in the box with their rings
 *  (AirspaceInView), as JSON text for the map's own decoder; null with no pack. */
fun CyclePacks.airspaceInView(south: Double, west: Double, north: Double, east: Double): String? {
    val packs = packsInBox(south, west, north, east) ?: return null
    return packsAirspace(packs, south, west, north, east)
}

/** The VORs in the box (NavaidsInView's vors), as JSON text; null with no pack. */
fun CyclePacks.navaidsInView(south: Double, west: Double, north: Double, east: Double): String? {
    val packs = packsInBox(south, west, north, east) ?: return null
    return packsNavaids(packs, south, west, north, east)
}
