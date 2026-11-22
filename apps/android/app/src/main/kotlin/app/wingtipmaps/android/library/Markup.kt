package app.wingtipmaps.android.library

import android.content.Context
import android.util.Base64
import androidx.ink.brush.Brush
import androidx.ink.brush.BrushFamily
import androidx.ink.brush.StockBrushes
import androidx.ink.storage.decode
import androidx.ink.storage.encode
import androidx.ink.strokes.Stroke
import androidx.ink.strokes.StrokeInputBatch
import app.wingtipmaps.android.KeptFile
import app.wingtipmaps.android.api.Gateway
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.util.UUID

/** What a mark is drawn with: the pen's ink, or the highlighter's. */
enum class Pen { INK, HIGHLIGHT }

/**
 * One mark on a page, a stylus's or a finger's, kept as Jetpack Ink's own
 * stroke inputs (ink-storage's encoding) with its brush, so it is drawn
 * again as it was drawn. Its points are the page's pixels as it was
 * drawn `width` wide, scaled to the page's width when drawn again, so a
 * mark stays where it was on any screen and at any zoom. A highlight may
 * carry the pilot's note, shown at `noteX`, `noteY`, fractions of the
 * page's width and height.
 */
@Serializable
data class Mark(
    val id: String,
    val page: Int,
    val pen: Pen,
    val color: Int,
    val size: Float,
    val inputs: String,
    val width: Float,
    val note: String? = null,
    val noteX: Float = 0f,
    val noteY: Float = 0f,
) {
    /** The stroke drawn again, or none where its inputs do not decode. */
    fun stroke(): Stroke? = runCatching {
        Stroke(brush(pen, color, size), StrokeInputBatch.decode(Base64.decode(inputs, Base64.NO_WRAP)))
    }.getOrNull()

    companion object {
        fun family(pen: Pen): BrushFamily = when (pen) {
            Pen.INK -> StockBrushes.pressurePen()
            Pen.HIGHLIGHT -> StockBrushes.highlighter()
        }

        fun brush(pen: Pen, color: Int, size: Float): Brush = Brush.createWithColorIntArgb(family(pen), color, size, EPSILON)

        /** A finished stroke on `page`, drawn on it `width` by `height`
         *  pixels, as kept; its note's place its first point. */
        fun of(page: Int, pen: Pen, stroke: Stroke, width: Float, height: Float): Mark {
            val first = stroke.inputs.takeIf { it.size > 0 }?.get(0)
            return Mark(
                id = UUID.randomUUID().toString(),
                page = page,
                pen = pen,
                color = stroke.brush.colorIntArgb,
                size = stroke.brush.size,
                inputs = Base64.encodeToString(stroke.inputs.encode(), Base64.NO_WRAP),
                width = width,
                noteX = (first?.x ?: 0f) / width.coerceAtLeast(1f),
                noteY = (first?.y ?: 0f) / height.coerceAtLeast(1f),
            )
        }

        /** The smallest detail a stroke keeps, in pixels. */
        private const val EPSILON = 0.1f
    }
}

/**
 * A document's marks, kept on this phone alone (files/library/markup/,
 * one file a document), never sent: markup is the pilot's, as their own
 * documents are (docs/privacy-inventory.md). Undo takes back the last
 * mark made on a page.
 */
class MarkupStore internal constructor(private val dir: File, private val doc: String) {
    private val kept = KeptFile(File(dir, doc.replace(':', '_') + ".json"))
    private val coder = ListSerializer(Mark.serializer())
    private val _marks = MutableStateFlow(kept.read()?.let { runCatching { Gateway.json.decodeFromString(coder, it) }.getOrNull() }.orEmpty())
    val marks: StateFlow<List<Mark>> = _marks.asStateFlow()

    fun add(marks: List<Mark>) = change { it + marks }

    fun note(id: String, note: String?) = change { list -> list.map { if (it.id == id) it.copy(note = note?.trim()?.ifEmpty { null }) else it } }

    fun remove(id: String) = change { list -> list.filterNot { it.id == id } }

    fun undo(page: Int) = change { list -> list.lastOrNull { it.page == page }?.let { last -> list - last } ?: list }

    fun clear(page: Int) = change { list -> list.filterNot { it.page == page } }

    /** Every mark gone: the document it was on deleted. */
    fun clearAll() = change { emptyList() }

    private fun change(edit: (List<Mark>) -> List<Mark>) {
        _marks.update(edit)
        val now = _marks.value
        kept.write { Gateway.json.encodeToString(coder, now) }
    }

    companion object {
        /** The markup folder, for the phone's wipe. */
        fun dir(context: Context) = File(context.applicationContext.filesDir, "library/markup")

        fun of(context: Context, doc: String) = MarkupStore(dir(context), doc)    }
}
