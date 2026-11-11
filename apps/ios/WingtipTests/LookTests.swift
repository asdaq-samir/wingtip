import SwiftUI
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

    /// A filled button's words pass WCAG 1.4.3's 4.5:1 on the look's tint
    /// in every brand look by day and at night: white on the deep blues, the
    /// dark ground on the light tints at night (Glass Cockpit's #46D3E6
    /// read 1.79:1 under white, the iOS sheet audit of 2026-11-10). Native
    /// keeps the system's own.
    @Test func aFilledButtonsWordsPassOnEveryTint() throws {
        for look in Look.allCases where !look.isStock {
            for dark in [false, true] {
                let label = try #require(look.labelOnTint(dark: dark))
                let ratio = NightPalette.contrast(label, look.tint(dark: dark))
                #expect(ratio >= 4.5, "\(look.label) \(dark ? "dark" : "light"): \(ratio)")
            }
        }
        #expect(Self.hex(try #require(Look.cockpit.labelOnTint(dark: true))) == 0x0B1422)
        #expect(Look.native.labelOnTint(dark: true) == nil)
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
        #expect(ChartInk.native(dark: false).tint == .blue && ChartInk.native(dark: true).tint == .blue)
    }

    /// The app names no global accent colour, so Native's controls are the
    /// system's systemBlue (iOS 26's #0088FF by day), and the brand looks'
    /// are theirs because the root sets them: SwiftUI's tint, which the
    /// tint shape style follows (and Color.accentColor does not), and the
    /// window's, for what the system draws itself (an alert's buttons).
    @MainActor @Test func theAccentIsTheSystemsInNativeAndTheBrandsOtherwise() {
        let system = Self.hex(Self.drawn(AnyShapeStyle(Color.accentColor), tint: nil))
        #expect(Self.near(Self.drawn(AnyShapeStyle(Color.accentColor), tint: nil), 0x0088FF), "drawn \(String(system, radix: 16))")
        let brand = Self.hex(Self.drawn(AnyShapeStyle(.tint), tint: Look.wingtip.appliedTint(dark: false)))
        #expect(Self.near(Self.drawn(AnyShapeStyle(.tint), tint: Look.wingtip.appliedTint(dark: false)), 0x0066CC), "drawn \(String(brand, radix: 16))")
        #expect(Look.native.windowTint == nil)
        let window = Look.wingtip.windowTint
        #expect(window.map { Self.hex($0.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))) } == 0x57A8FF)
        #expect(window.map { Self.hex($0.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))) } == 0x0066CC)
    }

    /// The colour a style draws under a root tint (nil: none set).
    @MainActor private static func drawn(_ style: AnyShapeStyle, tint: Color?) -> UIColor {
        let renderer = ImageRenderer(content: Rectangle().fill(style).frame(width: 2, height: 2).tint(tint))
        renderer.scale = 1
        guard let image = renderer.cgImage else { return .clear }
        // Drawn again into one known layout, sRGB RGBA, whatever the
        // renderer's own bitmap is.
        var px = [UInt8](repeating: 0, count: 4)
        let drew = px.withUnsafeMutableBytes { buffer in
            CGContext(data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
                .map { $0.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1)); return true } ?? false
        }
        guard drew else { return .clear }
        return UIColor(red: CGFloat(px[0]) / 255, green: CGFloat(px[1]) / 255, blue: CGFloat(px[2]) / 255, alpha: 1)
    }

    private static func near(_ colour: UIColor, _ want: Int) -> Bool {
        let got = hex(colour)
        return [16, 8, 0].allSatisfy { abs((got >> $0 & 0xFF) - (want >> $0 & 0xFF)) <= 3 }
    }
}
