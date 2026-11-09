import Foundation
import UIKit

/// A figure as VoiceOver should say it to a pilot: the number in words
/// with its unit, as the figure is read over the radio -- "four thousand
/// five hundred feet", "one one eight point one", "zero nine zero
/// degrees" -- where the screen writes "4,500 ft", "118.1" and "090°",
/// which VoiceOver would read letter by letter or as a telephone number.
/// The screen's own text is untouched; these go in accessibility labels.
enum SpokenFigures {
    /// A number in words: 4,500 as "four thousand five hundred", 12.3 as
    /// "twelve point three". Format's own words, written by hand rather
    /// than by NumberFormatter's spellOut, whose words change with the OS,
    /// so a figure is said alike on every iPhone and as the web says it.
    static func number(_ x: Double, decimals: Int = 0) -> String { Format.words(x, decimals: decimals) }

    /// A number and its unit, the unit singular for one.
    private static func measure(_ x: Double, decimals: Int, _ one: String, _ many: String) -> String {
        let said = number(x, decimals: decimals)
        return "\(said) \(said == "one" ? one : many)"
    }

    /// A length or a height that is not an altitude (a runway, a tower, a
    /// ceiling) in plain words; an altitude flown or assigned is said as
    /// ATC says it, with Format.spokenAltitude.
    static func feet(_ ft: Double) -> String { measure(ft, decimals: 0, "foot", "feet") }
    static func knots(_ kt: Double) -> String { Format.spokenSpeed(kt) }
    static func nauticalMiles(_ nm: Double) -> String { Format.spokenDistance(nm) }
    static func statuteMiles(_ sm: Double) -> String { measure(sm, decimals: 1, "statute mile", "statute miles") }
    static func gallons(_ gal: Double) -> String { Format.spokenFuel(gal) }
    static func feetPerMinute(_ fpm: Double) -> String { "\(number(fpm)) feet per minute" }

    /// Minutes as "one hour two minutes", "forty minutes".
    static func minutes(_ minutes: Double) -> String { Format.spokenDuration(minutes) }

    /// Each figure said on its own, as a radio frequency, a heading or a
    /// transponder code is: "118.1" as "one one eight point one".
    static func digits(_ text: String) -> String { Format.digits(text) }

    /// A heading or course of three figures, north as 360 as the screen
    /// writes it: "090" as "zero nine zero degrees".
    static func degrees(_ deg: Double) -> String { Format.spokenHeading(deg) }

    /// A radio frequency, as AirportWords.mhz writes it, figure by figure.
    static func frequency(_ mhz: Double) -> String { digits(AirportWords.mhz(mhz)) }

    /// The compass point in full, the engine's word (AirportWords.compassWord).
    static func compass(_ deg: Double) -> String { AirportWords.compassWord(deg) }

    /// A flight category's code as pilots say it: "VFR" is read as its
    /// letters by VoiceOver already; "LIFR" and "MVFR" are not.
    static func flightCategory(_ code: String?) -> String {
        switch code {
        case "VFR": "VFR"
        case "MVFR": "marginal VFR"
        case "IFR": "IFR"
        case "LIFR": "low IFR"
        default: "no weather report"
        }
    }
}

/// Whether the map's moves are animated: not with Reduce Motion on, when
/// a pan or a zoom steps to its end instead (the UIKit side of SwiftUI's
/// accessibilityReduceMotion, read where MapKit is driven).
enum MapMotion {
    static var animated: Bool { !UIAccessibility.isReduceMotionEnabled }
}

/// A live alert said by VoiceOver as it comes, where a sighted pilot sees
/// it come in (the copilot's message, a call from ATC, the best field in
/// an emergency): a banner appearing is otherwise silent to VoiceOver.
/// Each caller posts once per new alert. An urgent one is said at once,
/// over what VoiceOver is reading; the others wait their turn.
enum Announce {
    @MainActor
    static func alert(_ words: String, urgent: Bool = false) {
        let said = NSAttributedString(string: words, attributes: [
            .accessibilitySpeechAnnouncementPriority: urgent ? UIAccessibilityPriority.high : UIAccessibilityPriority.default,
            .accessibilitySpeechQueueAnnouncement: !urgent,
        ])
        UIAccessibility.post(notification: .announcement, argument: said)
    }
}
