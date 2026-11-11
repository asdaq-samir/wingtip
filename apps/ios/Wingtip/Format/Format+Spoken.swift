import Foundation

/// The written forms said: what VoiceOver reads for a figure the screen
/// writes, the spoken- rows of the shared table (formats.json), so
/// VoiceOver here and a screen reader on the web say a figure in the same
/// words. "4,500 ft" read as written is "four comma five hundred f t";
/// these are "four thousand five hundred feet".
///
/// The words are written here by hand, not by NumberFormatter's spellOut,
/// whose words change with the OS ("forty-five" on one, "forty five" on
/// another) and would let the iPhone drift from the table and the web.
/// A screen reader is not a radio, so nine is "nine", not "niner" (AIM 4-2-8).
extension Format {
    /// What is said for a figure not known, where the screen writes a dash.
    static let spokenNone = "not known"

    /// An altitude said as a pilot hears it from ATC (AIM 4-2-9a): the
    /// separate digits of the thousands, then the hundreds, and what is
    /// left in words: 12,500 is "one two thousand five hundred feet".
    static func spokenAltitude(_ ft: Double?) -> String {
        guard let ft else { return spokenNone }
        let whole = Int(ft.rounded(.toNearestOrAwayFromZero))
        if whole == 0 { return "zero feet" }
        let size = abs(whole)
        let (thousands, rest) = (size / 1000, size % 1000)
        var parts: [String] = whole < 0 ? ["minus"] : []
        if thousands > 0 { parts.append("\(digits(String(thousands))) thousand") }
        if rest > 0 { parts.append(words(rest)) }
        return parts.joined(separator: " ") + (size == 1 ? " foot" : " feet")
    }

    /// A course, heading, track or wind direction said figure by figure
    /// (AIM 4-2-10), north as three six zero as the written form has it
    /// (FAA Order JO 7110.65, 2-4-17): "zero four five degrees".
    static func spokenHeading(_ deg: Double) -> String {
        "\(digits(heading(deg).filter(\.isNumber))) degrees"
    }

    /// A magnetic course or heading said with its reference.
    static func spokenHeadingMagnetic(_ deg: Double) -> String { "\(spokenHeading(deg)) magnetic" }

    /// A true course or heading said with "true", as AIM 4-2-10 asks of a
    /// direction that is not magnetic.
    static func spokenHeadingTrue(_ deg: Double) -> String { "\(spokenHeading(deg)) true" }

    /// Nautical miles to the written tenth: "one hundred two point four
    /// nautical miles", "twenty-four nautical miles".
    static func spokenDistance(_ nm: Double?) -> String {
        guard let nm else { return spokenNone }
        return measure(nm, decimals: 1, "nautical mile", "nautical miles")
    }

    /// Whole knots, as written: "one hundred ten knots".
    static func spokenSpeed(_ kt: Double?) -> String {
        guard let kt else { return spokenNone }
        return measure(kt, decimals: 0, "knot", "knots")
    }

    /// US gallons to the written tenth: "thirty-two point three gallons".
    static func spokenFuel(_ gal: Double?) -> String {
        guard let gal else { return spokenNone }
        return measure(gal, decimals: 1, "gallon", "gallons")
    }

    /// Minutes, rounded as written, in full words: "one hour five minutes".
    static func spokenDuration(_ minutes: Double) -> String {
        let whole = max(0, Int(minutes.rounded()))
        let (h, m) = (whole / 60, whole % 60)
        var parts: [String] = []
        if h > 0 { parts.append("\(words(h)) \(h == 1 ? "hour" : "hours")") }
        if m > 0 || h == 0 { parts.append("\(words(m)) \(m == 1 ? "minute" : "minutes")") }
        return parts.joined(separator: " ")
    }

    /// A UTC time said digit by digit with "zulu", as the AIM gives a time
    /// (AIM 4-2-13): "one four three two zulu".
    static func spokenZulu(_ date: Date) -> String {
        "\(digits(String(zulu(date).dropLast()))) zulu"
    }

    // MARK: Words the spoken forms are built from

    private static let ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
                               "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
                               "seventeen", "eighteen", "nineteen"]
    private static let tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
    private static let scales = [(1_000_000_000, "billion"), (1_000_000, "million"), (1_000, "thousand")]

    /// A whole number in words, tens hyphenated and no "and", as the
    /// table writes them: 1,234 is "one thousand two hundred thirty-four".
    static func words(_ n: Int) -> String {
        if n < 0 { return "minus \(words(-n))" }
        if n < 20 { return ones[n] }
        if n < 100 { return tens[n / 10] + (n % 10 == 0 ? "" : "-\(ones[n % 10])") }
        if n < 1000 { return "\(ones[n / 100]) hundred" + (n % 100 == 0 ? "" : " \(words(n % 100))") }
        for (size, name) in scales where n >= size {
            return "\(words(n / size)) \(name)" + (n % size == 0 ? "" : " \(words(n % size))")
        }
        return String(n)
    }

    /// A number to so many places in words, rounded as the written form
    /// is and without a "point zero" it does not have: "twelve point three".
    static func words(_ x: Double, decimals: Int) -> String {
        let scale = Int(pow(10, Double(decimals)))
        let scaled = Int((abs(x) * Double(scale)).rounded(.toNearestOrAwayFromZero))
        let (whole, part) = (scaled / scale, scaled % scale)
        let sign = x < 0 && scaled > 0 ? "minus " : ""
        guard part > 0 else { return sign + words(whole) }
        let fraction = String(String(part).leftPadded(to: decimals).reversed().drop { $0 == "0" }.reversed())
        return "\(sign)\(words(whole)) point \(digits(fraction))"
    }

    /// Each figure said on its own: "118.1" is "one one eight point one".
    static func digits(_ text: String) -> String {
        text.compactMap { c -> String? in
            if let d = c.wholeNumberValue, (0...9).contains(d) { return ones[d] }
            return c == "." ? "point" : nil
        }.joined(separator: " ")
    }

    /// A number and its unit, the unit singular for exactly one as said.
    private static func measure(_ x: Double, decimals: Int, _ one: String, _ many: String) -> String {
        let said = words(x, decimals: decimals)
        return "\(said) \(said == "one" ? one : many)"
    }
}
