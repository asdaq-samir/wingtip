import Foundation
import Testing
@testable import Wingtip

/// Each nav-log row in its phase's figures, as the engine states them
/// (the owner, 2026-11-13: "the calculations should reflect that phase of
/// flight"): which figures belong to which piece, never worked out here.
@MainActor
struct LegPhaseTests {
    private let leg = Leg.preview(from: "A", to: "B", distanceNm: 20, altitudeFt: 5500, trueCourseDeg: 0, magneticHeadingDeg: 0,
                                  groundspeedKt: 100, eteMin: 11.64, fuelGal: 1.21, tasKt: 100)

    @Test func aLegFlownWholeInOnePhaseSaysWhich() {
        var climbing = leg
        climbing.phase = "climb"
        #expect(LegPhase.of(climbing) == .climb)
        #expect(LegRow.spoken(climbing, number: 1).contains("in the climb"))
        var descending = leg
        descending.phase = "descent"
        #expect(LegPhase.of(descending) == .descent && LegPhase.of(leg) == nil)
    }

    @Test func theClimbPieceIsTheTopOfClimbsFigures() throws {
        // The web's rows.test case: a 3 nm climb into a 20 kt headwind at
        // 70 kt TAS, 50 kt over the ground, 3.6 min and 0.78 gal at 13.1 gph.
        var climbing = leg
        climbing.toc = APITopOfClimb(alongNm: 3, altitudeFt: 5500, eteMin: 3.6, fuelBurnGph: 13.1, fuelGal: 0.78, groundspeedKt: 50,
                                     lat: 42, lon: -88, magneticHeadingDeg: 10, tasKt: 70)
        let piece = try #require(LegPhase.climbPiece(climbing))
        #expect(piece.phase == .climb && piece.tasKt == 70 && piece.groundspeedKt == 50 && piece.fuelBurnGph == 13.1)
        #expect(piece.minutes == 3.6 && piece.gallons == 0.78 && piece.magneticHeadingDeg == 10)
    }

    @Test func theDescentPieceIsTheDescentsOwnOrNone() throws {
        // The engine's descent_phase example: the top 8 nm in, the leg 11.64
        // min and 1.21 gal, the 12 nm after it at 105.3 kt in 6.84 min.
        var down = leg
        down.tod = APITopOfDescent(alongNm: 8, altitudeFt: 5500, descentAtCruise: false, eteMin: 4.8, fpm: 600, fuelBurnGph: 5, fuelGal: 0.64,
                                   groundspeedKt: 105.3, lat: 42, lon: -88, pattern: true, tasKt: 105.3, toFt: 1500)
        let piece = try #require(LegPhase.descentPiece(down))
        #expect(piece.phase == .descent && piece.groundspeedKt == 105.3 && piece.fuelBurnGph == 5)
        #expect(abs((piece.minutes ?? 0) - 6.84) < 1e-9 && abs((piece.gallons ?? 0) - 0.57) < 1e-9)
        #expect(!LegPhase.descentAtCruise(down))
        // On the cruise's figures for want of the airplane's: no piece of
        // its own, and the row says so and asks.
        var atCruise = down
        atCruise.tod?.descentAtCruise = true
        #expect(LegPhase.descentPiece(atCruise) == nil && LegPhase.descentAtCruise(atCruise))
        #expect(LegPhase.atCruiseWords == "Flown at the cruise's speed and fuel flow, for want of the airplane's descent figures.")
    }
}
