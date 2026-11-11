package app.wingtipmaps.android.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.core.graphics.createBitmap
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.plates.PlateTagsModel
import kotlin.math.ceil

/**
 * A fix's tag on a plate as a picture, drawn with Android's Canvas at the
 * screen's density as StationPictures draws its: ForeFlight's dark box
 * (the owner's screenshot, 2026-11-11) with the fix's name and figures a
 * line each in white, each altitude barred under, over or both as the
 * FAA charts it (TagLine), and the runway's tag on the course's chip
 * colour, as ForeFlight sets its runway tag apart. A picture rather than
 * a label, so the bars are drawn: the map's own glyphs have none.
 */
object PlateTagPictures {
    /** The words' size and the box's room round them, in dp. */
    private const val TEXT_DP = 13f
    private const val PAD_DP = 4f
    private const val LINE_GAP_DP = 2f
    private const val BAR_DP = 1.5f
    private const val CORNER_DP = 4f

    fun picture(label: PlateTagsModel.Label, density: Float): Bitmap {
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = WingtipColors.Chart.CASING_HEX.toColorInt()
            textSize = TEXT_DP
            typeface = Typeface.DEFAULT_BOLD
        }
        val metrics = text.fontMetrics
        val lineHeight = (metrics.descent - metrics.ascent) + LINE_GAP_DP + BAR_DP * 2
        val width = label.lines.maxOfOrNull { text.measureText(it.text) } ?: 0f
        val w = width + PAD_DP * 2
        val h = lineHeight * label.lines.size + PAD_DP * 2
        val bitmap = createBitmap(ceil(w * density).toInt().coerceAtLeast(1), ceil(h * density).toInt().coerceAtLeast(1))
        bitmap.density = Math.round(density * 160)
        val canvas = Canvas(bitmap)
        canvas.scale(density, density)
        val ground = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = (if (label.runway) WingtipColors.Chart.COURSE_CHIP_HEX else WingtipColors.Chart.TAG_HEX).toColorInt()
            alpha = GROUND_ALPHA
        }
        canvas.drawRoundRect(0f, 0f, w, h, CORNER_DP, CORNER_DP, ground)
        val bar = Paint(text).apply { strokeWidth = BAR_DP }
        label.lines.forEachIndexed { i, line ->
            val top = PAD_DP + i * lineHeight + BAR_DP
            val baseline = top - metrics.ascent
            val lineWidth = text.measureText(line.text)
            canvas.drawText(line.text, PAD_DP, baseline, text)
            if (line.over) canvas.drawLine(PAD_DP, top, PAD_DP + lineWidth, top, bar)
            if (line.under) canvas.drawLine(PAD_DP, baseline + metrics.descent, PAD_DP + lineWidth, baseline + metrics.descent, bar)
        }
        return bitmap
    }

    /** Nine tenths solid, so the plate's own drawing just shows under it. */
    private const val GROUND_ALPHA = 230
}
