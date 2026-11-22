import Foundation

/// Special VFR in a Class B, C or D surface area (14 CFR 91.157(a)): what
/// it asks, or why an airplane may not fly it at the area's primary
/// airport (part 91 appendix D, section 3), each line with its rule, as
/// the engine's `special_vfr` answers it from the class and the airport
/// alone. Nothing of the rule is here: the web's SpecialVfr and
/// BandSpecialVfr, Android's SpecialVfrGroup, ask the engine the same.
struct SpecialVfrRead: Equatable {
    struct Line: Equatable, Hashable {
        let words: String
        let source: String
    }

    let available: Bool
    let lines: [Line]

    /// The group's title, Title Case as design/wording.json has the app's
    /// headings (decision 0021).
    var title: String { available ? String(localized: "Special VFR") : String(localized: "No Special VFR") }

    /// The classes whose surface area special VFR is asked of, as the web's
    /// BandSpecialVfr picks them.
    static let surfaceClasses: Set<String> = ["B", "C", "D"]

    /// The B, C or D band from the surface under a point: its floor at or
    /// below the ground's height there, which the card says as "Surface"
    /// (AirportWords.bandRange); none where the ground is not known.
    static func surfaceBand(_ bands: [AirspaceBand], ground: Double?) -> AirspaceBand? {
        guard let ground else { return nil }
        return bands.first { surfaceClasses.contains($0.airspaceClass) && $0.floorFt <= ground }
    }

    /// The engine's answer for that band, with its primary airport
    /// (`ident`, NASR's Class Airspace IDENT, which appendix D is read by).
    static func ask(_ band: AirspaceBand) throws -> SpecialVfrRead {
        let answer = try Engine.specialVfr(surfaceArea: band.airspaceClass, airport: band.ident)
        let lines = answer.available
            ? answer.needs.map { Line(words: $0.words, source: $0.source) }
            : answer.problems.map { Line(words: $0.words, source: $0.source) }
        return SpecialVfrRead(available: answer.available, lines: lines)
    }
}
