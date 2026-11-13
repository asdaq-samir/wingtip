package app.wingtipmaps.android.ai.read

import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.SerialKind
import kotlinx.serialization.descriptors.StructureKind

/**
 * The JSON shape Gemini Nano is asked to fill when it reads a page on the
 * phone, sketched from the very class the answer is decoded into (the
 * app's LogbookPageRead or HandbookRead, documents/model): each key as the wire names it, with its type, so no second
 * description of the page can drift from the one the engine checks.
 * Pure, for a unit test (SchemaSketchTest).
 */
object SchemaSketch {
    /** How deep a sketch goes: the reads nest three levels at most. */
    private const val DEPTH = 4

    fun of(d: SerialDescriptor, depth: Int = 0): String {
        if (depth > DEPTH) return "null"
        // A nullable descriptor keeps its class's kind and elements.
        val sketch = when (d.kind) {
            StructureKind.CLASS, StructureKind.OBJECT ->
                (0 until d.elementsCount).joinToString(", ", "{", "}") { i ->
                    "\"${d.getElementName(i)}\": ${of(d.getElementDescriptor(i), depth + 1)}"
                }
            StructureKind.LIST -> "[${of(d.getElementDescriptor(0), depth + 1)}]"
            StructureKind.MAP -> "{\"key\": ${of(d.getElementDescriptor(1), depth + 1)}}"
            PrimitiveKind.STRING -> "\"string\""
            PrimitiveKind.BOOLEAN -> "true|false"
            PrimitiveKind.INT, PrimitiveKind.LONG, PrimitiveKind.SHORT, PrimitiveKind.BYTE -> "0"
            PrimitiveKind.DOUBLE, PrimitiveKind.FLOAT -> "0.0"
            SerialKind.ENUM -> (0 until d.elementsCount).joinToString("|", "\"", "\"") { d.getElementName(it) }
            else -> "null"
        }
        return if (d.isNullable) "$sketch|null" else sketch
    }
}
