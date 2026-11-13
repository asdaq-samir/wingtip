package app.wingtipmaps.android.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import androidx.core.graphics.createBitmap
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.engine.generated.EngineContract
import org.maplibre.android.maps.Style

/**
 * The pictures the airport weather's layers wear (StationLayer), drawn
 * with Android's Canvas at the screen's density as OverlayPictures draws
 * the chart's: the station model's wind barb, as the engine's `wind_barb`
 * counts it, pointing up for the layer to turn to where the wind is
 * from, in the chart's ink or red past the airplane's demonstrated
 * crosswind (the web's stationModel barbSvg); calm's ring; and the
 * getting-worse badge. Each in the brand's chart tokens, cased in white
 * so it reads on the sectional's colours.
 */
object StationPictures {
    const val CALM = "wx|calm"
    const val WORSE = "wx|worse"

    /** The most flags a barb is drawn with: 200 kt, past any surface wind
     *  a METAR has sent. */
    private const val MOST_FLAGS = 3

    /** The barb's picture for the engine's `wind_barb` (FAA-H-8083-28B,
     *  25.2.3.4.5): calm's ring, or the stem with its flags (50 kt), barbs
     *  (10 kt) and half-barb (5 kt); "|over" on the red one, past the
     *  airplane's demonstrated crosswind (the engine's `wind_arrow`). */
    fun barbId(barb: EngineContract.WindBarbAnswer, over: Boolean = false): String =
        if (barb.calm) CALM else "wx|barb|${barb.flags.coerceAtMost(MOST_FLAGS)}|${barb.barbs}|${barb.halfBarbs}${if (over) "|over" else ""}"

    fun addTo(style: Style, density: Float) {
        style.addImage(CALM, calm(density))
        for (flags in 0..MOST_FLAGS) {
            for (barbs in 0..4) {
                for (half in 0..1) {
                    if (flags + barbs + half == 0) continue
                    style.addImage("wx|barb|$flags|$barbs|$half", barb(flags, barbs, half, INK, density))
                    style.addImage("wx|barb|$flags|$barbs|$half|over", barb(flags, barbs, half, RED, density))
                }
            }
        }
        style.addImage(WORSE, worse(density))
    }

    // Read as each picture is drawn, so the ids above load in the JVM's
    // tests, which have no Android colour parser.
    private val INK get() = WingtipColors.Chart.FIX_INK_HEX.toColorInt()
    private val CASING get() = WingtipColors.Chart.CASING_HEX.toColorInt()
    private val RED get() = WingtipColors.Chart.WARNING_HEX.toColorInt()

    /** The barb's box: its staff from just outside the field's weather
     *  ring (BARB_GAP dp above the box's foot, where the layer anchors it
     *  on the field) to the box's top. */
    private const val BARB_W = 24f
    private const val BARB_H = 46f
    private const val BARB_GAP = 16f

    private fun barb(pennants: Int, fulls: Int, half: Int, ink: Int, density: Float): Bitmap = picture(BARB_W, BARB_H, density) {
        val x = BARB_W / 2
        val top = 6f
        val feathers = Path()
        var y = top
        repeat(pennants) {
            feathers.moveTo(x, y)
            feathers.lineTo(x + 9f, y - 4f)
            feathers.lineTo(x, y + 4f)
            feathers.close()
            y += 6f
        }
        val lines = Path()
        repeat(fulls) {
            lines.moveTo(x, y)
            lines.lineTo(x + 9f, y - 4f)
            y += 4f
        }
        if (half == 1) {
            // A half barb alone is set in from the staff's end, so it is
            // not read as a full one.
            if (pennants == 0 && fulls == 0) y += 4f
            lines.moveTo(x, y)
            lines.lineTo(x + 5f, y - 2.2f)
        }
        lines.moveTo(x, top)
        lines.lineTo(x, BARB_H - BARB_GAP)
        drawPath(lines, stroke(CASING, 4f))
        drawPath(feathers, stroke(CASING, 2f))
        drawPath(lines, stroke(ink, 1.8f))
        drawPath(feathers, fill(ink))
    }

    /** Calm: a ring round the field's symbol and its weather ring. */
    private fun calm(density: Float): Bitmap = picture(40f, 40f, density) {
        drawCircle(20f, 20f, 17f, stroke(CASING, 4f))
        drawCircle(20f, 20f, 17f, stroke(INK, 1.8f))
    }

    /** Getting worse: a small amber disc with a down chevron, in the
     *  brand's caution amber, edged in white. */
    private fun worse(density: Float): Bitmap = picture(16f, 16f, density) {
        drawCircle(8f, 8f, 7f, fill(WingtipColors.Chart.CAUTION_HEX.toColorInt()))
        drawCircle(8f, 8f, 7f, stroke(CASING, 1.3f))
        val chevron = Path().apply {
            moveTo(4.5f, 6.5f)
            lineTo(8f, 10f)
            lineTo(11.5f, 6.5f)
        }
        drawPath(chevron, stroke(INK, 2f))
    }

    private fun picture(w: Float, h: Float, density: Float, draw: Canvas.() -> Unit): Bitmap {
        val bitmap = createBitmap(Math.round(w * density).coerceAtLeast(1), Math.round(h * density).coerceAtLeast(1))
        bitmap.density = Math.round(density * 160)
        val canvas = Canvas(bitmap)
        canvas.scale(density, density)
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
        strokeCap = Paint.Cap.ROUND
    }
}
