package app.wingtipmaps.android.map

import app.wingtipmaps.android.map.generated.OverlayStyle
import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory

/**
 * What changes over the overlay layers (design/map-style.json's, MapStyle),
 * as the web's glOverlays sets it: the map's global state the layers read
 * (OverlayStyle.State), so a switch or a field's weather is one state set,
 * with no layer, filter or expression made again.
 */
internal object OverlayState {
    /** Setup's switches: the airspace's and the navaids' layers shown or
     *  hidden, and the armed services' and private fields shown or not (a
     *  joint-use field always, the layers' own rule). */
    fun switches(style: Style, layers: MapLayers) {
        for (id in MapStyle.AIRSPACE_LAYERS + MapStyle.NAVAID_LAYERS) {
            style.getLayer(id)?.setProperties(PropertyFactory.visibility(if (MapStyle.visible(id, layers)) Property.VISIBLE else Property.NONE))
        }
        style.setGlobalStateProperty(OverlayStyle.State.SHOW_MILITARY, JsonPrimitive(layers.military))
        style.setGlobalStateProperty(OverlayStyle.State.SHOW_PRIVATE, JsonPrimitive(layers.privateFields))
    }

    /** Each reporting field's weather pip by its ident (AirportWeatherMarks'
     *  pips), which the airports' mark reads as its picture's middle: one
     *  object in the state, where a `match` over every field heard grew with
     *  each answer and was set as a new expression (the round-5 map audit's N4). */
    fun weather(style: Style, pips: Map<String, String>) {
        style.setGlobalStateProperty(OverlayStyle.State.AIRPORT_WEATHER, weatherState(pips))
    }

    fun weatherState(pips: Map<String, String>): JsonObject = JsonObject().apply { for ((ident, pip) in pips) addProperty(ident, pip) }

    /** Both, on a style just set. */
    fun set(style: Style, layers: MapLayers, pips: Map<String, String>) {
        switches(style, layers)
        weather(style, pips)
    }
}
