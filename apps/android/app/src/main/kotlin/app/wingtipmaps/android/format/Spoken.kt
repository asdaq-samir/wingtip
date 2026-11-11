package app.wingtipmaps.android.format

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Every figure as TalkBack says it: the content description of a written
 * figure, held to the same table as the written forms
 * (apps/web/src/lib/fixtures/formats.json's spoken* formats, FormatTest).
 * TalkBack reads "4,500 ft" as "four comma five hundred f t", and "045°"
 * as "zero forty-five degree", so a figure the pilot hears is written out
 * here in words, in English as the rest of the app's words are. The words
 * are written by hand rather than through ICU's spell-out rules, whose
 * "and"s and older Android versions' differences would not match the
 * table the web and the iPhone say.
 */
object Spoken {
    /** What is said where the written form shows a dash. */
    const val NOT_KNOWN = "not known"

    private val ONES = listOf(
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
        "seventeen", "eighteen", "nineteen",
    )
    private val TENS = listOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")

    /** A whole number in words, hyphened tens and no "and":
     *  "one hundred two", "thirty-four", "two thousand one". */
    fun number(n: Long): String {
        if (n < 0) return "minus " + number(-n)
        if (n < 20) return ONES[n.toInt()]
        if (n < 100) return TENS[(n / 10).toInt()] + if (n % 10 == 0L) "" else "-" + ONES[(n % 10).toInt()]
        for ((size, name) in listOf(1_000_000_000L to "billion", 1_000_000L to "million", 1_000L to "thousand", 100L to "hundred")) {
            if (n >= size) {
                val rest = n % size
                return number(n / size) + " " + name + if (rest == 0L) "" else " " + number(rest)
            }
        }
        return ONES[0]
    }

    /** Figures said one by one, nine as "nine" (a screen reader is not a
     *  radio; AIM 4-2-8 keeps "niner" for the air): "one four three two". */
    fun digits(figures: String): String =
        figures.filter { it.isDigit() }.map { ONES[it - '0'] }.joinToString(" ")

    /** A number to the written tenth, with no "point zero": "one hundred
     *  two point four", "twenty-four". The tenth is rounded as the written
     *  form's %.1f rounds it, so the two never differ. */
    private fun tenths(v: Double): String {
        val written = String.format(Locale.US, "%.1f", v)
        val (whole, tenth) = written.split('.')
        val words = number(whole.toLong())
        return if (tenth == "0") words else "$words point ${ONES[tenth.toInt()]}"
    }

    private fun unit(words: String, one: String, many: String) = "$words ${if (words == "one") one else many}"

    /** An altitude said as ATC gives it (AIM 4-2-9a): the thousands'
     *  figures one by one, then the rest in words, "one two thousand five
     *  hundred feet", "seven hundred eighty feet". */
    fun altitude(ft: Double?): String {
        if (ft == null) return NOT_KNOWN
        val whole = ft.roundToLong()
        if (whole == 0L) return "zero feet"
        val n = abs(whole)
        val thousands = n / 1000
        val rest = n % 1000
        val parts = buildList {
            if (thousands > 0) add(digits(thousands.toString()) + " thousand")
            if (rest > 0) add(number(rest))
        }
        return (if (whole < 0) "minus " else "") + parts.joinToString(" ") + " feet"
    }

    /** A course, heading, track or wind direction: its three figures one
     *  by one (AIM 4-2-10), north as three six zero (FAA Order JO 7110.65,
     *  2-4-17), "zero four five degrees". */
    fun heading(deg: Double): String = digits(Format.headingFigures(deg)) + " degrees"

    /** A magnetic course or heading, "three four six degrees magnetic". */
    fun headingMagnetic(deg: Double): String = heading(deg) + " magnetic"

    /** A true course or heading: AIM 4-2-10 says "true" wherever a
     *  direction is not magnetic. */
    fun headingTrue(deg: Double): String = heading(deg) + " true"

    /** Nautical miles to the written tenth: "one hundred two point four
     *  nautical miles". */
    fun distance(nm: Double?): String =
        if (nm == null) NOT_KNOWN else unit(tenths(nm), "nautical mile", "nautical miles")

    /** Whole knots as written: "one hundred ten knots". */
    fun speed(kt: Double?): String =
        if (kt == null) NOT_KNOWN else unit(number(kt.roundToInt().toLong()), "knot", "knots")

    /** US gallons to the written tenth: "thirty-two point three gallons". */
    fun fuel(gal: Double?): String =
        if (gal == null) NOT_KNOWN else unit(tenths(gal), "gallon", "gallons")

    /** A time aloft, left or an age, to the minute as written: "one hour
     *  five minutes", "forty-five minutes". */
    fun duration(minutes: Double?): String {
        if (minutes == null) return NOT_KNOWN
        val whole = minutes.roundToInt()
        val h = whole / 60
        val m = whole % 60
        val parts = buildList {
            if (h > 0) add(unit(number(h.toLong()), "hour", "hours"))
            if (m > 0 || h == 0) add(unit(number(m.toLong()), "minute", "minutes"))
        }
        return parts.joinToString(" ")
    }

    private val ZULU = DateTimeFormatter.ofPattern("HHmm", Locale.US).withZone(ZoneOffset.UTC)

    /** A UTC time figure by figure and "zulu" (AIM 4-2-13): "one four
     *  three two zulu". */
    fun zulu(at: Instant): String = digits(ZULU.format(at)) + " zulu"

    fun zulu(iso: String): String = zulu(Instant.parse(iso))
}
