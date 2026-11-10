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
        #expect(Look.allCases.map(\.label) == ["Wingtip", "Glass Cockpit", "Chart Ink", "Native"])
        #expect(Self.hex(Look.cockpit.tint(dark: false)) == 0x00707E)
    }

    /// Native is iOS's own (the owner, 2026-11-10): the system's blue, label
    /// and grounds by name, so they follow the appearance and Increase
    /// Contrast; the states stay the theme's, being aviation's.
    @Test func theNativeLookIsTheSystemsOwnAndKeepsTheStates() {
        let light = Look.native.palette(dark: false), dark = Look.native.palette(dark: true)
        #expect(Look.native.tint(dark: false) == .systemBlue)
        #expect(light.foreground == .label && light.background == .systemBackground && light.sheet == .systemGroupedBackground)
        #expect(light.mutedForeground == .secondaryLabel)
        #expect(Self.hex(light.cautionInk) == Self.hex(WingtipPalette.light.cautionInk))
        #expect(Self.hex(dark.goInk) == Self.hex(WingtipPalette.dark.goInk))
        #expect(Self.hex(dark.destructiveInk) == Self.hex(WingtipPalette.dark.destructiveInk))
        let strip = ChartInk.native(dark: false)
        #expect(strip.magenta == ChartInk.light.magenta && strip.caution == ChartInk.light.caution)
    }

    /// Native is iOS out of the box (the owner, 2026-11-10): the app sets no
    /// tint over it, so a control draws in the system's own accent, the
    /// strip's tappable words in that same accent, and only Native steps
    /// the brand's modifiers aside.
    @Test func theNativeLookSetsNoTintOfItsOwn() {
        #expect(Look.native.appliedTint(dark: false) == nil && Look.native.appliedTint(dark: true) == nil)
        #expect(Look.allCases.filter(\.isStock) == [.native])
        for look in Look.allCases where !look.isStock {
            #expect(look.appliedTint(dark: false) != nil)
        }
        #expect(ChartInk.native(dark: false).tint == .accentColor && ChartInk.native(dark: true).tint == .accentColor)
    }
}
