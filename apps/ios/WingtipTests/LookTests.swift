import Testing
import UIKit
@testable import Wingtip

/// The brand look is the default (the owner, 2026-11-09), its tint the
/// tokens' #0066CC by day and #57A8FF at night; the other looks stay.
@Suite struct LookTests {
    private static func hex(_ colour: UIColor) -> Int {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.getRed(&r, green: &g, blue: &b, alpha: &a)
        return Int((r * 255).rounded()) << 16 | Int((g * 255).rounded()) << 8 | Int((b * 255).rounded())
    }

    @Test func theBrandLookIsTheDefaultAndItsBlueTheTokens() {
        #expect(Look.standard == .wingtip)
        #expect(Self.hex(Look.wingtip.tint(dark: false)) == 0x0066CC)
        #expect(Self.hex(Look.wingtip.tint(dark: true)) == 0x57A8FF)
        #expect(Look.allCases.map(\.label) == ["Wingtip", "Glass Cockpit", "Chart Ink"])
        #expect(Self.hex(Look.cockpit.tint(dark: false)) == 0x00707E)
    }
}
