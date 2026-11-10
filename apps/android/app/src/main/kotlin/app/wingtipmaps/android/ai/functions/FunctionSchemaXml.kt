package app.wingtipmaps.android.ai.functions

import org.w3c.dom.Element
import java.io.InputStream
import javax.xml.parsers.DocumentBuilderFactory

/**
 * The app's functions as the AppFunctions compiler described them
 * (assets/wingtip_functions.xml, written at build time from
 * WingtipFunctions and FunctionWords), read back so Gemini Nano in the
 * app's own Ask is given the very same tools Gemini is: one source, no
 * second list to drift. Pure (the JDK's own XML reader), for a unit test.
 */
object FunctionSchemaXml {
    /** The asset the compiler writes (WingtipFunctions' appFunctionXmlFileName). */
    const val ASSET = "wingtip_functions.xml"

    enum class Kind { STRING, INT, LONG, DOUBLE, BOOLEAN, STRING_LIST, OTHER }

    data class Param(val name: String, val description: String, val kind: Kind, val required: Boolean)

    /** A function by its method's name (the part after '#' in its id). */
    data class Tool(val name: String, val description: String, val params: List<Param>)

    fun read(xml: InputStream): List<Tool> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(xml)
        val functions = doc.documentElement.getElementsByTagName("appfunction")
        return (0 until functions.length).map { i ->
            val f = functions.item(i) as Element
            Tool(
                name = text(f, "functionId").substringAfterLast('#'),
                description = text(f, "description"),
                params = children(f, "parameters").map { p ->
                    val type = children(p, "dataTypeMetadata").firstOrNull()
                    Param(text(p, "name"), text(p, "description"), kind(type), text(p, "isRequired") == "true")
                },
            )
        }
    }

    /** AppFunctionDataTypeMetadata's type codes, the ones the app's
     *  functions take. */
    private fun kind(type: Element?): Kind {
        if (type == null) return Kind.OTHER
        return when (text(type, "type")) {
            "1" -> Kind.BOOLEAN
            "4", "5" -> Kind.DOUBLE
            "6" -> Kind.LONG
            "7" -> Kind.INT
            "8" -> Kind.STRING
            "10" -> if (children(type, "itemType").firstOrNull()?.let { text(it, "type") } == "8") Kind.STRING_LIST else Kind.OTHER
            else -> Kind.OTHER
        }
    }

    /** The text of the element's own child of that name, not a deeper one's. */
    private fun text(parent: Element, tag: String): String = children(parent, tag).firstOrNull()?.textContent?.trim().orEmpty()

    private fun children(parent: Element, tag: String): List<Element> {
        val nodes = parent.childNodes
        return (0 until nodes.length).mapNotNull { nodes.item(it) as? Element }.filter { it.tagName == tag }
    }
}
