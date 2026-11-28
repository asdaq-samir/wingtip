package app.wingtipmaps.android.map

import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.Tfr
import app.wingtipmaps.android.api.tfrs
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMapLabel
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.gonogoTfrWhen
import app.wingtipmaps.android.ui.FieldNotams
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The temporary flight restrictions on the map, always, as the web's
 * TfrGl draws them: a hazard a pilot must know of near the route (14 CFR
 * 91.103), with no switch to lose it by (the owner, 2026-11-14; ported to
 * Android on the owner's "Yes, port now", 2026-11-27). In force, a solid
 * red edge over a red wash; not yet in force, dashed over a fainter one;
 * its NOTAM number along its edge, the number the pilot is briefed by.
 * The FAA's TFR red (chart.tfr), the edges and the numbers dimmed at night
 * by their colour (MapDim.colour, the owner's "Dim by colour"): the red
 * over the paper at the default Dimmer about 3:1, where see-through it was
 * 1.27:1. The washes, already faint, are not dimmed, as no fill is. Under
 * the route's slot, with the airspace. Asked of the planner (/api/tfrs) as
 * the map opens and every ten minutes, the web's tfrsQuery; an answer that
 * does not come leaves the last one drawn and is asked again sooner.
 */
internal class TfrLayer {
    private var json: String? = null
    private var night = false

    /** The TFRs kept fresh while the map is up, each answer drawn by `redraw` (ChartMap's). */
    suspend fun keep(redraw: ((Style) -> Unit) -> Unit) {
        while (true) {
            val tfrs = try {
                Planner.tfrs().tfrs
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
            // The same answer again (most polls) sets nothing: Native would tile the source and lay its words out anew (W4).
            val next = tfrs?.let { withContext(Dispatchers.Default) { features(it, AppClock.nowMs()) } }
            if (next != null && next != json) {
                json = next
                redraw(::draw)
            }
            delay(if (tfrs == null) RETRY_MS else EVERY_MS)
        }
    }

    /** The TFRs on a style, set again when the style is set anew; nothing before the first answer. */
    fun draw(style: Style) {
        val data = json ?: return
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(data)
            return
        }
        style.addSource(GeoJsonSource(SOURCE, data))
        val active = Expression.get("active")
        val later = Expression.not(active)
        val red = MapDim.colour(WingtipColors.Chart.TFR_HEX.toColorInt())
        under(style, FillLayer(FILL, SOURCE).withProperties(PropertyFactory.fillColor(WingtipColors.Chart.TFR_HEX), PropertyFactory.fillOpacity(0.14f)).withFilter(active))
        under(style, FillLayer(FILL_LATER, SOURCE).withProperties(PropertyFactory.fillColor(WingtipColors.Chart.TFR_HEX), PropertyFactory.fillOpacity(0.06f)).withFilter(later))
        under(style, LineLayer(LINE, SOURCE).withProperties(PropertyFactory.lineColor(red), PropertyFactory.lineWidth(2.5f), PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND)).withFilter(active))
        under(style, LineLayer(LINE_LATER, SOURCE).withProperties(PropertyFactory.lineColor(red), PropertyFactory.lineWidth(2f), PropertyFactory.lineDasharray(arrayOf(3f, 2.5f))).withFilter(later))
        under(
            style,
            SymbolLayer(LABEL, SOURCE).withProperties(
                PropertyFactory.symbolPlacement(Property.SYMBOL_PLACEMENT_LINE),
                PropertyFactory.symbolSpacing(320f),
                PropertyFactory.textField(Expression.get("id")),
                PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
                PropertyFactory.textSize(MapLabels.lateSize(WingtipMapLabel.SIZE_SMALL)),
                PropertyFactory.textMaxAngle(30f),
                PropertyFactory.textHaloWidth(WingtipMapLabel.HALO),
            ),
        )
        paint(style, night)
    }

    /**
     * The number's ink and halo by day or night (the web's labelInk and
     * labelHalo for a hazard): the red on the white halo by day; at night
     * map.label.night-ink's lighter red, dimmed by its colour, on the tag's
     * dark halo, which is left whole so the words keep their contrast with
     * it (the round-6 themes audit's N1).
     */
    fun paint(style: Style, night: Boolean) {
        this.night = night
        val ink = if (night) WingtipMapLabel.NIGHT_INK[WingtipColors.Chart.TFR_HEX] ?: WingtipColors.Chart.TFR_HEX else WingtipColors.Chart.TFR_HEX
        style.getLayerAs<SymbolLayer>(LABEL)?.setProperties(
            PropertyFactory.textColor(MapDim.colour(ink.toColorInt())),
            PropertyFactory.textHaloColor(if (night) MapLabels.NIGHT_HALO else WingtipColors.Chart.CASING_HEX),
        )
    }

    private fun under(style: Style, layer: Layer) {
        if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
    }

    companion object {
        const val SOURCE = "tfrs"
        private const val FILL = "tfrs-fill"
        private const val FILL_LATER = "tfrs-fill-later"
        private const val LINE = "tfrs-line"
        private const val LINE_LATER = "tfrs-line-later"
        private const val LABEL = "tfrs-label"

        /** The web's tfrsQuery: asked again every ten minutes; a failed ask again in one. */
        private const val EVERY_MS = 10 * 60_000L
        private const val RETRY_MS = 60_000L

        /**
         * The TFRs as one GeoJSON source, each its NOTAM number and whether
         * it is in force at `nowMs`, by the engine's gonogo_tfr_when (a TFR
         * with no times in force; a time that does not read no bound). Where
         * the engine cannot say, in force: the safe side, drawn solid.
         */
        fun features(tfrs: List<Tfr>, nowMs: Long): String = buildJsonObject {
            put("type", "FeatureCollection")
            putJsonArray("features") {
                for (tfr in tfrs) addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") {
                        put("id", tfr.notamId)
                        put("active", inForce(tfr, nowMs))
                    }
                    put("geometry", tfr.geometry)
                }
            }
        }.toString()

        private fun inForce(tfr: Tfr, nowMs: Long): Boolean {
            fun us(iso: String?) = FieldNotams.instantOf(iso)?.toEpochMilli()?.times(1000.0)
            return Engine.gonogoTfrWhen(nowMs * 1000.0, us(tfr.effective), us(tfr.expires)).getOrNull()?.let { it == "in-force" } ?: true
        }
    }
}
