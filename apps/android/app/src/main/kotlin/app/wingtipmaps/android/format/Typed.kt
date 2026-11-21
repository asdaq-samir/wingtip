package app.wingtipmaps.android.format

/**
 * A figure the pilot typed, read whatever the phone's region, as the
 * iPhone's Typed. On a phone set to Germany or France the decimal keyboard
 * offers a comma, and "8,5".toDoubleOrNull() is null: the aircraft form
 * refused the fuel burn and a logbook edit was silently kept as drafted. A
 * comma is read as the decimal point unless it groups thousands ("4,500",
 * three figures after it, or more than one comma); with both, the later
 * one is the decimal point ("1.234,5" and "1,234.5" are both 1234.5).
 */
object Typed {
    fun number(text: String): Double? {
        var t = text.trim()
        val comma = t.lastIndexOf(',')
        val point = t.lastIndexOf('.')
        t = when {
            comma >= 0 && point >= 0 -> if (comma > point) t.replace(".", "").replace(',', '.') else t.replace(",", "")
            comma >= 0 -> {
                val after = t.substring(comma + 1)
                val grouping = t.count { it == ',' } > 1 || (after.length == 3 && after.all(Char::isDigit))
                if (grouping) t.replace(",", "") else t.replace(',', '.')
            }
            else -> t
        }
        return t.toDoubleOrNull()
    }
}
