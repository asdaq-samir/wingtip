package app.wingtipmaps.android.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.graphics.createBitmap
import androidx.core.graphics.toColorInt
import org.maplibre.android.maps.ImageContent
import org.maplibre.android.maps.ImageStretches
import org.maplibre.android.maps.Style

/**
 * The pictures the overlay layers wear (MapStyle's icon ids), drawn once
 * a style at the screen's density, the web's own (glOverlays
 * NAVAID_PICTURES, AIRSPACE_TAB_PICTURE, airportMark's
 * sectionalAirportSvg) drawn with Android's Canvas in place of an SVG:
 * the sectional's airport symbols (FAA Aeronautical Chart User's Guide,
 * VFR Terms and Symbols, Airports) as ForeFlight rings them, the VOR's
 * hexagon, a fix's blue four-point star, a VFR waypoint's green triangle,
 * the VOR's blue ident tag and the airspace's dark altitude tab, the last
 * two stretched to their text, and the special-use areas' hatch and tabs.
 */
object OverlayPictures {
    /** Every picture added to a style being built, before it loads, so no
     *  symbol is laid out without its picture. [density] is the screen's
     *  pixels to a dp. */
    fun addTo(builder: Style.Builder, density: Float) {
        // 2 inks, 4 sizes, 6 pips and 4 uses: 192 small pictures.
        for (towered in listOf(true, false)) {
            for (size in MapStyle.SIZES) {
                for (pip in AirportWeatherMarks.PIPS) {
                    for (use in MapStyle.USES) {
                        builder.withImage(MapStyle.airportMarkId(towered, size, pip, use), airport(towered, size, pip, use, density))
                    }
                }
            }
        }
        builder.withImage("nav|vor", vor(density))
        builder.withImage("nav|fix", star(density))
        builder.withImage("nav|vfr", triangle(12f, 6f, 1f, 11.2f, 10.4f, 0.8f, ink(MapStyle.VFR_GREEN), Color.WHITE, 1.4f, density))
        stretched(builder, MapStyle.NAV_TAG, tag(density), 4f, density)
        for (cls in listOf("B", "C", "D")) {
            stretched(builder, MapStyle.airspaceTab(cls), airspaceTab(ink(MapStyle.AIRSPACE_INK.getValue(cls).colour), density), 4f, density)
        }
        builder.withImage(SpecialUseLayers.HATCH_RESTRICTED, hatch(ink(SpecialUseLayers.RESTRICTED_INK), density))
        builder.withImage(SpecialUseLayers.HATCH_MOA, hatch(ink(SpecialUseLayers.MOA_INK), density))
        // The special-use areas' tabs: the airspace's, bordered in their ink.
        stretched(builder, SpecialUseLayers.TAB_RESTRICTED, airspaceTab(ink(SpecialUseLayers.RESTRICTED_INK), density), 4f, density)
        stretched(builder, SpecialUseLayers.TAB_MOA, airspaceTab(ink(SpecialUseLayers.MOA_INK), density), 4f, density)
        for (near in listOf(true, false)) {
            for (hasTrack in listOf(true, false)) {
                builder.withImage(MapStyle.trafficIconId(near, hasTrack), airplane(near, hasTrack, density))
            }
        }
        stretched(builder, MapStyle.TRAFFIC_TAG, trafficTag(density), 4f, density)
    }

    /** A picture `inset` dp each way kept as drawn and the middle
     *  stretched to the text (the web's Stretch, MapLibre's stretch and
     *  content areas, in the picture's own pixels). */
    private fun stretched(builder: Style.Builder, id: String, bitmap: Bitmap, inset: Float, density: Float) {
        val i = inset * density
        val w = bitmap.width.toFloat()
        val h = bitmap.height.toFloat()
        builder.withImage(id, bitmap, listOf(ImageStretches(i, w - i)), listOf(ImageStretches(i, h - i)), ImageContent(i, i, w - i, h - i))
    }

    private fun ink(hex: String): Int = hex.toColorInt()

    /** A canvas of `size` dp square at the screen's density, its origin
     *  moved to `origin` dp, as the web's SVG's viewBox. The bitmap says
     *  its density, which MapLibre reads as the picture's pixel ratio. */
    private fun picture(size: Float, density: Float, origin: Float = 0f, draw: Canvas.() -> Unit): Bitmap {
        val px = Math.round(size * density).coerceAtLeast(1)
        val bitmap = createBitmap(px, px)
        bitmap.density = Math.round(density * 160)
        val canvas = Canvas(bitmap)
        canvas.scale(density, density)
        canvas.translate(origin, origin)
        canvas.draw()
        return bitmap
    }

    private fun fill(colour: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = colour
    }

    private fun stroke(colour: Int, width: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = colour
        strokeWidth = width
        strokeJoin = Paint.Join.ROUND
    }

    /** How big a field's symbol is drawn by its size (the web's
     *  SECTIONAL_RADIUS): the big fields the biggest. */
    private val RADIUS = mapOf("large" to 8.5f, "medium" to 7.5f, "small" to 6.5f, "other" to 6f)

    /** A field's mark (the web's sectionalAirportSvg), as ForeFlight
     *  draws it (the owner's screenshot over Madison, 2026-11-08): a ring
     *  in the airport's ink, blue towered and magenta not, round a white
     *  disc with a dot of the ink in its middle, inside a white halo; a
     *  private field the guide's circle with an "R", a military one with
     *  an "M", a heliport with an "H". Its weather (AirportWeatherMarks,
     *  `pip`) a ring in its flight category's colour round the white halo,
     *  WEATHER_RING dp wide so it holds in sunlight. */
    private fun airport(towered: Boolean, size: String, pip: String, use: String, density: Float): Bitmap {
        val colour = ink(if (towered) MapStyle.BLUE else MapStyle.MAGENTA)
        val letter = when (use) {
            "private" -> "R"
            "military" -> "M"
            "heliport" -> "H"
            else -> null
        }
        val r = if (letter != null) 7f else RADIUS[size] ?: 6f
        val weather = AirportWeatherMarks.inkOf(pip)?.let(::ink)
        return picture(30f, density, origin = 15f) {
            // The halo: white, 1.2 dp past the ring, and the weather's ring
            // round it.
            drawCircle(0f, 0f, r + if (weather != null) 1.2f else 2.5f, fill(Color.WHITE))
            if (weather != null) drawCircle(0f, 0f, r + 1.2f + WEATHER_RING / 2, stroke(weather, WEATHER_RING))
            if (letter != null) {
                drawCircle(0f, 0f, r, stroke(colour, 2f))
                val type = fill(colour).apply {
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    textSize = 9.5f
                    textAlign = Paint.Align.CENTER
                }
                drawText(letter, 0f, 3.5f, type)
            } else {
                drawCircle(0f, 0f, r, stroke(colour, 2.6f))
                drawCircle(0f, 0f, r * 0.42f, fill(colour))
            }
        }
    }

    /** The weather's ring round a symbol, dp: about 4.5 points, the
     *  owner's pick (2026-11-10), wide enough to read in sunlight. */
    private const val WEATHER_RING = 4.5f

    /** How big a traffic airplane is drawn, dp (the web's TRAFFIC_MARK, 16
     *  at the owner's ask, 2026-10-28), the chevron in its 22-unit box. */
    private const val TRAFFIC_MARK = 16f

    /** An airplane of the traffic (the web's trafficIcon): a chevron
     *  pointing up, which the layer turns to its track, in its colour with
     *  a white casing; a dot where it sends no track. The casing 2 dp on
     *  the screen however the box is scaled. */
    private fun airplane(near: Boolean, hasTrack: Boolean, density: Float): Bitmap {
        val colour = ink(if (near) MapStyle.TRAFFIC_NEAR else MapStyle.TRAFFIC_FAR)
        val scale = TRAFFIC_MARK / 22f
        // A little room round the box for the casing's outer half.
        return picture(TRAFFIC_MARK + 4f, density, origin = 2f) {
            scale(scale, scale)
            val casing = 2f / scale
            if (hasTrack) {
                val chevron = Path().apply {
                    moveTo(11f, 2f)
                    lineTo(18f, 19f)
                    lineTo(11f, 14.5f)
                    lineTo(4f, 19f)
                    close()
                }
                drawPath(chevron, fill(colour))
                drawPath(chevron, stroke(Color.WHITE, casing))
            } else {
                drawCircle(11f, 11f, 5f, fill(colour))
                drawCircle(11f, 11f, 5f, stroke(Color.WHITE, casing))
            }
        }
    }

    /** The dark tag under an airplane its height and callsign sit on (the
     *  web's #1f2933 at 80 %), stretched to the text. */
    private fun trafficTag(density: Float): Bitmap = picture(12f, density) {
        drawRoundRect(RectF(0f, 0f, 12f, 12f), 3f, 3f, fill(Color.argb(204, 0x1f, 0x29, 0x33)))
    }

    /** The VOR's hexagon: white, edged in the chart's blue, a dot at its
     *  middle (Chart User's Guide, Radio Aids to Navigation). */
    private fun vor(density: Float): Bitmap = picture(16f, density) {
        val hexagon = Path().apply {
            moveTo(15f, 8f)
            lineTo(11.5f, 14.06f)
            lineTo(4.5f, 14.06f)
            lineTo(1f, 8f)
            lineTo(4.5f, 1.94f)
            lineTo(11.5f, 1.94f)
            close()
        }
        drawPath(hexagon, fill(Color.WHITE))
        drawPath(hexagon, stroke(ink(MapStyle.BLUE), 2f))
        drawCircle(8f, 8f, 1.6f, fill(ink(MapStyle.BLUE)))
    }

    /** A triangle with its top at (topX, topY) and its base from (rightX,
     *  baseY) to (leftX, baseY): a fix's or a VFR waypoint's. */
    private fun triangle(
        size: Float, topX: Float, topY: Float, rightX: Float, baseY: Float, leftX: Float,
        inside: Int, edge: Int, edgeWidth: Float, density: Float,
    ): Bitmap = picture(size, density) {
        val path = Path().apply {
            moveTo(topX, topY)
            lineTo(rightX, baseY)
            lineTo(leftX, baseY)
            close()
        }
        drawPath(path, fill(inside))
        drawPath(path, stroke(edge, edgeWidth))
    }

    /** The VOR's blue ident tag, its ident set white on it. */
    private fun tag(density: Float): Bitmap = picture(12f, density) {
        drawRoundRect(RectF(0f, 0f, 12f, 12f), 3f, 3f, fill(ink(MapStyle.BLUE)))
    }

    /** The dark tab an airspace's altitudes sit in, as ForeFlight's: a
     *  rounded box bordered in its class's ink. */
    private fun airspaceTab(edge: Int, density: Float): Bitmap = picture(12f, density) {
        val box = RectF(0.75f, 0.75f, 11.25f, 11.25f)
        drawRoundRect(box, 3f, 3f, fill(Color.argb(235, 0x14, 0x18, 0x1f)))
        drawRoundRect(box, 3f, 3f, stroke(edge, 1.5f))
    }

    /** A fix's four-point star, blue with a white rim, as ForeFlight draws
     *  an enroute fix over the chart (the web's nav|fix). */
    private fun star(density: Float): Bitmap = picture(20f, density, origin = 10f) {
        val path = Path().apply {
            moveTo(0f, -9f)
            lineTo(2.2f, -2.2f)
            lineTo(9f, 0f)
            lineTo(2.2f, 2.2f)
            lineTo(0f, 9f)
            lineTo(-2.2f, 2.2f)
            lineTo(-9f, 0f)
            lineTo(-2.2f, -2.2f)
            close()
        }
        drawPath(path, fill(ink(MapStyle.FIX_BLUE)))
        drawPath(path, stroke(Color.WHITE, 1.2f))
    }

    /** One tick of a special-use area's hatch (the web's SUA_PICTURES): a
     *  short diagonal stroke in the area's ink on a faint wash of it, 7 by
     *  10 dp, repeated along the band by its line-pattern. */
    private fun hatch(colour: Int, density: Float): Bitmap {
        val bitmap = createBitmap(Math.round(7 * density), Math.round(10 * density))
        bitmap.density = Math.round(density * 160)
        Canvas(bitmap).apply {
            scale(density, density)
            drawRect(0f, 0f, 7f, 10f, fill(Color.argb(36, Color.red(colour), Color.green(colour), Color.blue(colour))))
            drawLine(1.5f, 9.5f, 5.5f, 0.5f, stroke(Color.argb(230, Color.red(colour), Color.green(colour), Color.blue(colour)), 1.3f).apply {
                strokeCap = Paint.Cap.ROUND
            })
        }
        return bitmap
    }
}
