import Testing
import UIKit
@testable import Wingtip

/// The night palette (NightPalette.swift), the same as the web app's dark
/// theme: each colour by day and at night, the chart's dimming by the
/// setting, and the contrast of a mark's words on their halo (WCAG 1.4.3's
/// 4.5:1, as the web app's contrast.test.ts holds its tokens to).
struct NightPaletteTests {
    private let day = UITraitCollection(userInterfaceStyle: .light)
    private let night = UITraitCollection(userInterfaceStyle: .dark)

    private func hex(_ colour: UIColor, _ traits: UITraitCollection) -> UInt32 {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
        return UInt32((r * 255).rounded()) << 16 | UInt32((g * 255).rounded()) << 8 | UInt32((b * 255).rounded())
    }

    private func alpha(_ colour: UIColor, _ traits: UITraitCollection) -> CGFloat {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
        return a
    }

    @Test func thePaletteIsTheOwnersCockpitColours() throws {
        #expect(hex(NightPalette.ground, day) == 0x0B1422)
        #expect(hex(NightPalette.surface, day) == 0x17283A)
        #expect(hex(NightPalette.caution, day) == 0xF5B85E)
        #expect(hex(NightPalette.positive, day) == 0x75D7A3)
    }

    @Test func theCourseIsThePrintedMagentaByDayAndAtNight() {
        #expect(hex(NightPalette.course, day) == 0xE600E6)
        #expect(hex(NightPalette.course, night) == 0xE600E6)
        #expect(hex(NightPalette.casing(night: false), day) == 0xFFFFFF)
        #expect(hex(NightPalette.casing(night: true), day) == 0x0B1422)
    }

    @Test func theHaloAndTheMarksFillFollowTheAppearance() throws {
        #expect(hex(NightPalette.halo, day) == 0xFFFFFF)
        #expect(hex(NightPalette.halo, night) == 0x0B1422)
        #expect(hex(NightPalette.markFill, night) == 0x17283A)
        #expect(alpha(NightPalette.halo, night) > 0.85)
        #expect(hex(NightPalette.trafficFar, night) == 0x06B6D4)
        #expect(hex(NightPalette.trafficNear, night) == 0xF59E0B)
    }

    @Test func theChartIsDimmedByTheDimmerKeptForTheAppearanceDrawn() throws {
        // The web's defaults (lib/map/chartLook): none by day, half at night.
        #expect(ChartLook.shade(dimLight: 0, dimDark: ChartLook.nightDim, dark: true) == 0.5)
        #expect(ChartLook.shade(dimLight: 0, dimDark: ChartLook.nightDim, dark: false) == 0)
        // Never past the deepest dim, never under none.
        #expect(ChartLook.shade(dimLight: 0, dimDark: 0.9, dark: true) == 0.7)
        #expect(ChartLook.shade(dimLight: -0.2, dimDark: 0.5, dark: false) == 0)
        #expect(ChartLook.offset(0.9) == ChartLook.contrastMax && ChartLook.offset(-0.9) == ChartLook.contrastMin)
    }

    @Test func aSettingIsKeyedByItsWholeSteps() {
        // Three steps of 0.05 add up to 0.15000000000000002: the same key as 0.15.
        #expect(ChartLook.steps(0.05 + 0.05 + 0.05) == ChartLook.steps(0.15))
        #expect(ChartLook.steps(0.15) == 3 && ChartLook.steps(-0.3) == -6 && ChartLook.steps(0) == 0)
    }

    @Test func contrastIsWCAGsRatio() throws {
        #expect(abs(NightPalette.contrast(.black, .white) - 21) < 0.001)
        #expect(abs(NightPalette.contrast(UIColor(hex: 0x767676), .white) - 4.54) < 0.01)
    }

    @Test func aMarksWordsReadOnTheirHaloInBothAppearances() throws {
        for traits in [day, night] {
            let words = UIColor.label.resolvedColor(with: traits)
            let halo = UIColor(hex: hex(NightPalette.halo, traits))
            #expect(NightPalette.contrast(words, halo) >= 4.5)
        }
        // The night's words on its surfaces, as the web app's tokens.
        #expect(NightPalette.contrast(UIColor(hex: 0xEEF3F9), NightPalette.surface) >= 4.5)
        // The course and the traffic stand off the night's ground (WCAG
        // 1.4.11's 3:1 for what is not words).
        #expect(NightPalette.contrast(NightPalette.course, NightPalette.ground) >= 3)
        #expect(NightPalette.contrast(NightPalette.trafficFar, NightPalette.ground) >= 3)
    }
}
