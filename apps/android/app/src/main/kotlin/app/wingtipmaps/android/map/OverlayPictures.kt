package app.wingtipmaps.android.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import org.maplibre.android.maps.ImageContent
import org.maplibre.android.maps.ImageStretches
import org.maplibre.android.maps.Style

/**
 * The pictures the overlay layers wear (MapStyle's icon ids), drawn once
 * a style at the screen's density, the web's own (glOverlays
 * NAVAID_PICTURES, AIRSPACE_TAB_PICTURE, airportMark's
 * sectionalAirportSvg) drawn with Android's Canvas in place of an SVG:
 * the sectional's airport symbols (FAA Aeronautical Chart User's Guide,
 * VFR Terms and Symbols, Airports), the VOR's hexagon, a fix's triangle,
 * a VFR waypoint's green one, the VOR's blue ident tag and the airspace's
 * dark altitude tab, the last two stretched to their text.
 */
object OverlayPictures {
    /** Every picture added to a style being built, before it loads, so no
     *  symbol is laid out without its picture. [density] is the screen's
     *  pixels to a dp. */
    fun addTo(builder: Style.Builder, density: Float) {
        // 2 inks, 4 sizes, 5 pips and 4 uses: 160 small pictures, as the web's.
        for (towered in listOf(true, false)) {
            for (size in MapStyle.SIZES) {
                for (pip in MapStyle.PIPS) {
                    for (use in MapStyle.USES) {
                        builder.withImage(MapStyle.airportMarkId(towered, size, pip, use), airport(towered, size, pip, use, density))
                    }
                }
            }
        }
        builder.withImage("nav|vor", vor(density))
        builder.withImage("nav|fix", triangle(10f, 5f, 1f, 9.4f, 8.8f, 0.6f, Color.WHITE, ink(MapStyle.FIX_INK), 1.2f, density))
        builder.withImage("nav|vfr", triangle(12f, 6f, 1f, 11.2f, 10.4f, 0.8f, ink(MapStyle.VFR_GREEN), Color.WHITE, 1.4f, density))
        stretched(builder, MapStyle.NAV_TAG, tag(density), 4f, density)
        stretched(builder, MapStyle.AIRSPACE_TAB, airspaceTab(density), 4f, density)
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

    private fun ink(hex: String): Int = Color.parseColor(hex)

    /** A canvas of `size` dp square at the screen's density, its origin
     *  moved to `origin` dp, as the web's SVG's viewBox. The bitmap says
     *  its density, which MapLibre reads as the picture's pixel ratio. */
    private fun picture(size: Float, density: Float, origin: Float = 0f, draw: Canvas.() -> Unit): Bitmap {
        val px = Math.round(size * density).coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
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
    private val RADIUS = mapOf("large" to 7f, "medium" to 6f, "small" to 5f, "other" to 4.5f)

    /** A field's mark (the web's sectionalAirportSvg): a solid disc, blue
     *  towered and magenta not, edged in white; a private field the
     *  guide's small circle with an "R", a military one with an "M", a
     *  heliport with an "H"; its weather (its METAR's flight category's
     *  colour, `pip`) a small dot at its lower right, edged in white,
     *  where it has a report. */
    private fun airport(towered: Boolean, size: String, pip: String, use: String, density: Float): Bitmap {
        val colour = ink(if (towered) MapStyle.BLUE else MapStyle.MAGENTA)
        val letter = when (use) {
            "private" -> "R"
            "military" -> "M"
            "heliport" -> "H"
            else -> null
        }
        return picture(20f, density, origin = 10f) {
            if (letter != null) {
                drawCircle(0f, 0f, 5.5f, fill(Color.WHITE))
                drawCircle(0f, 0f, 5.5f, stroke(colour, 1.6f))
                val type = fill(colour).apply {
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    textSize = 8f
                    textAlign = Paint.Align.CENTER
                }
                drawText(letter, 0f, 2.9f, type)
            } else {
                val r = RADIUS[size] ?: 4.5f
                drawCircle(0f, 0f, r, fill(colour))
                drawCircle(0f, 0f, r, stroke(Color.WHITE, 1.5f))
            }
            if (pip.isNotEmpty()) {
                drawCircle(5.5f, 5.5f, 3f, fill(ink(pip)))
                drawCircle(5.5f, 5.5f, 3f, stroke(Color.WHITE, 1.2f))
            }
        }
    }

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
     *  rounded box edged in white. */
    private fun airspaceTab(density: Float): Bitmap = picture(12f, density) {
        val box = RectF(0.5f, 0.5f, 11.5f, 11.5f)
        drawRoundRect(box, 3f, 3f, fill(Color.argb(230, 0x1c, 0x23, 0x30)))
        drawRoundRect(box, 3f, 3f, stroke(Color.WHITE, 1f))
    }
}
