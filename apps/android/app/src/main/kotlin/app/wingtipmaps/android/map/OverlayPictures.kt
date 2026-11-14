package app.wingtipmaps.android.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.graphics.createBitmap
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import org.maplibre.android.maps.ImageContent
import org.maplibre.android.maps.ImageStretches
import org.maplibre.android.maps.Style

/**
 * The pictures the overlay layers wear (MapStyle's icon ids), drawn once
 * a style at the screen's density, the web's own (glOverlays
 * NAVAID_PICTURES, AIRSPACE_TAB_PICTURE, airportMark's
 * airportMarkSvg) drawn with Android's Canvas in place of an SVG: the
 * planner's airport mark, its ring the airspace at the field, the VOR's
 * hexagon, a fix's blue four-point star, a VFR waypoint's green triangle,
 * the VOR's blue ident tag and the airspace's dark altitude tab, the last
 * two stretched to their text, and the special-use areas' hatch and tabs.
 */
object OverlayPictures {
    /** Every picture added to a style being built, before it loads, so no
     *  symbol is laid out without its picture. [density] is the screen's
     *  pixels to a dp. */
    fun addTo(builder: Style.Builder, density: Float) {
        // 6 rings, 6 weathers and 4 uses: 144 small pictures; the size
        // steps are the layer's icon-size, not more pictures.
        for (space in MapStyle.SPACES) {
            for (pip in AirportWeatherMarks.PIPS) {
                for (use in MapStyle.USES) {
                    builder.withImage(MapStyle.airportMarkId(space, pip, use), airport(space, pip, use, density))
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

    /** An airport mark's symbol across, dp (the web's AIRPORT_MARK), and
     *  the room round it for its ticks' white casing, which reaches past
     *  its box; no more, as the box is what MapLibre keeps apart. */
    private const val AIRPORT_MARK = 26f
    private const val ROOM = 3f

    /** Drawn this much denser than the screen, so the largest size step
     *  (MapStyle.MARK_SIZE, 1.5) is as sharp as the chart under it. */
    private const val SHARP = 2f

    /**
     * A field's mark, the planner's one airport mark (the web's
     * airportMarkSvg, as Nearest, the route and the stops wear it; the
     * owner's pick of 2026-11-14, option I): a ring that is the airspace at
     * the field's surface in the sectional's own code -- Class B and D
     * blue, C and E magenta, D and E dashed as their boundaries are drawn
     * (FAA Aeronautical Chart User's Guide, Airspace), B's ring the
     * thickest and C's next, G the magenta thin and faded, an unknown
     * class the chart's grey -- with its four ticks, white inside it, and
     * a large disc in the field's weather colour (AirportWeatherMarks,
     * `pip`; the no-report grey with none or with the setting Off). A
     * private field is the R disc, a military one the M and a heliport the
     * H, with its weather dot at the lower right.
     */
    private fun airport(space: String, pip: String, use: String, density: Float): Bitmap {
        val casing = ink(WingtipColors.Chart.CASING_HEX)
        val weather = ink(AirportWeatherMarks.inkOf(pip) ?: WingtipColors.Chart.FIELD_UNKNOWN_HEX)
        val letter = when (use) {
            "private" -> "R"
            "military" -> "M"
            "heliport" -> "H"
            else -> null
        }
        val box = AIRPORT_MARK + 2 * ROOM
        val sharp = density * SHARP
        return picture(box, sharp, origin = box / 2) {
            if (letter != null) {
                drawCircle(0f, 0f, 10f, fill(ink(if (use == "military") MapStyle.BLUE else MapStyle.MAGENTA)))
                drawCircle(0f, 0f, 10f, stroke(casing, 2f))
                val type = fill(casing).apply {
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    textSize = 11f
                    textAlign = Paint.Align.CENTER
                }
                drawText(letter, 0f, 4f, type)
                drawCircle(7.5f, 7.5f, 4.6f, fill(weather))
                drawCircle(7.5f, 7.5f, 4.6f, stroke(casing, 1.4f))
                return@picture
            }
            val ringInk = when (space) {
                "B", "D" -> ink(MapStyle.BLUE)
                "C", "E", "G" -> ink(MapStyle.MAGENTA)
                else -> ink(WingtipColors.Chart.FIELD_UNKNOWN_HEX)
            }
            val alpha = if (space == "G") (0.45f * 255).toInt() else 255
            val ticks = Path().apply {
                moveTo(0f, -9f); lineTo(0f, -12.2f)
                moveTo(9f, 0f); lineTo(12.2f, 0f)
                moveTo(0f, 9f); lineTo(0f, 12.2f)
                moveTo(-9f, 0f); lineTo(-12.2f, 0f)
            }
            fun round(p: Paint) = p.apply { strokeCap = Paint.Cap.ROUND }
            // The white casing round ticks and ring, then the ticks, the
            // ring over a white disc, and the weather's disc.
            drawPath(ticks, round(stroke(casing, 5.5f)))
            drawCircle(0f, 0f, 8.5f, stroke(casing, 5.5f))
            drawPath(ticks, round(stroke(ringInk, 2.5f)).apply { this.alpha = alpha })
            drawCircle(0f, 0f, 8.5f, fill(casing))
            val width = when (space) {
                "B" -> 3.2f
                "C" -> 2.8f
                "G", "" -> 1.6f
                else -> 2.2f
            }
            val ring = stroke(ringInk, width).apply {
                this.alpha = alpha
                if (space == "D" || space == "E") pathEffect = DashPathEffect(floatArrayOf(3.4f, 2.1f), 0f)
            }
            drawCircle(0f, 0f, 8.5f, ring)
            drawCircle(0f, 0f, 6f, fill(weather))
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
