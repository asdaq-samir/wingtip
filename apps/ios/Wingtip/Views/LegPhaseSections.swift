import SwiftUI

/// A leg's phases as the engine states them (the owner, 2026-11-13: "the
/// calculations should reflect that phase of flight"): a leg flown whole
/// in the climb or the descent carries that phase's figures and says so
/// (`phase`); a leg cut by a top of climb carries the climb's figures for
/// the piece up to it on the top itself, and one cut by a top of descent
/// the descent's for the piece after it, where the airplane has them
/// (the engine's with_climbs, with_descents and descent_phase). Every
/// figure here is the engine's; this only reads which belongs to which
/// piece, as the web's nav log rows do (rows.ts climbPiece, descentPiece).
enum LegPhase: String, Equatable, Sendable {
    case climb, descent

    /// The phase a leg is flown in whole, nil for the cruise or a leg cut
    /// by a top (whose pieces are each one phase).
    static func of(_ leg: Leg) -> LegPhase? { leg.phase.flatMap(LegPhase.init(rawValue:)) }

    /// Its name on a row.
    var word: String { self == .climb ? String(localized: "Climb") : String(localized: "Descent") }

    /// One piece's figures: the speeds, the heading and the fuel flow, and
    /// the piece's own minutes and gallons where they are known.
    struct Piece: Equatable {
        let phase: LegPhase
        let tasKt: Double?
        let groundspeedKt: Double?
        let magneticHeadingDeg: Double?
        let fuelBurnGph: Double?
        let minutes: Double?
        let gallons: Double?
    }

    /// The piece up to a top of climb on the leg, at the climb's figures:
    /// its minutes and gallons are the top's own, counted from the leg's start.
    static func climbPiece(_ leg: Leg) -> Piece? {
        guard let toc = leg.toc else { return nil }
        return Piece(phase: .climb, tasKt: toc.tasKt, groundspeedKt: toc.groundspeedKt, magneticHeadingDeg: toc.magneticHeadingDeg,
                     fuelBurnGph: toc.fuelBurnGph, minutes: toc.eteMin, gallons: toc.fuelGal)
    }

    /// The piece after a top of descent on the leg, at the descent's own
    /// figures; nil where it is flown on the cruise's (`descent_at_cruise`),
    /// as the web's descentPiece leaves the piece as it is. Its minutes and
    /// gallons are what is left of the leg's after the top's.
    static func descentPiece(_ leg: Leg) -> Piece? {
        guard let tod = leg.tod, tod.descentAtCruise == false, let tas = tod.tasKt, let gs = tod.groundspeedKt else { return nil }
        let minutes = leg.eteMin.map { $0 - tod.eteMin }
        let gallons = leg.fuelGal.flatMap { total in tod.fuelGal.map { total - $0 } }
        return Piece(phase: .descent, tasKt: tas, groundspeedKt: gs, magneticHeadingDeg: tod.magneticHeadingDeg,
                     fuelBurnGph: tod.fuelBurnGph, minutes: minutes, gallons: gallons)
    }

    /// Whether the leg's descent is flown on the cruise's figures for want
    /// of the airplane's own (the engine's `descent_at_cruise`).
    static func descentAtCruise(_ leg: Leg) -> Bool { leg.tod?.descentAtCruise == true }

    /// The words under a top of descent flown on the cruise's figures, the web's.
    static let atCruiseWords = String(localized: "Flown at the cruise's speed and fuel flow, for want of the airplane's descent figures.")
}

/// The Route Leg card's tops of climb and descent: where each falls, and
/// the piece of the leg on its far side in that phase's own figures; a
/// descent on the cruise's figures says so and asks for the airplane's
/// descent speed and fuel flow in place (AskFigureRow; the owner,
/// 2026-11-09: ask, never assume).
struct LegTopsSection: View {
    let leg: Leg

    var body: some View {
        if leg.toc != nil || leg.tod != nil {
            Section("Climb and Descent") {
                if let toc = leg.toc {
                    LabeledContent("Top of climb", value: "\(Format.distance(toc.alongNm)) along")
                    if let piece = LegPhase.climbPiece(leg) { pieceRows(piece) }
                }
                if let tod = leg.tod {
                    LabeledContent("Top of descent", value: "\(Format.distance(tod.alongNm)) along")
                    LabeledContent("Descent", value: "\(Format.number(tod.fpm, decimals: 0)) fpm to \(Format.altitude(tod.toFt))")
                    if let piece = LegPhase.descentPiece(leg) { pieceRows(piece) }
                    if LegPhase.descentAtCruise(leg) {
                        Text(LegPhase.atCruiseWords)
                            .font(WingtipType.note)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("descent-at-cruise")
                        AskFigureRow(needs: [.descent], pickDetail: "Its descent is flown at its own speed and fuel flow")
                    }
                }
            }
        }
    }

    /// One piece's figures, each named for its phase.
    @ViewBuilder private func pieceRows(_ piece: LegPhase.Piece) -> some View {
        let name = piece.phase.word
        if let tas = piece.tasKt {
            LabeledContent("\(name) true airspeed", value: Format.speed(tas)).accessibilityValue(SpokenFigures.knots(tas))
        }
        if let gs = piece.groundspeedKt {
            LabeledContent("\(name) groundspeed", value: Format.speed(gs)).accessibilityValue(SpokenFigures.knots(gs))
        }
        if let heading = piece.magneticHeadingDeg {
            LabeledContent("\(name) magnetic heading", value: Format.heading(heading)).accessibilityValue(SpokenFigures.degrees(heading))
        }
        if let flow = piece.fuelBurnGph {
            LabeledContent("\(name) fuel flow", value: "\(Format.number(flow, decimals: 1)) gal/h")
        }
        if let minutes = piece.minutes {
            LabeledContent("\(name) time", value: Format.duration(minutes)).accessibilityValue(SpokenFigures.minutes(minutes))
        }
        if let gallons = piece.gallons {
            LabeledContent("\(name) fuel", value: Format.fuel(gallons)).accessibilityValue(SpokenFigures.gallons(gallons))
        }
    }
}
