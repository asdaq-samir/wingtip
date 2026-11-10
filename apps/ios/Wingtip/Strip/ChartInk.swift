import SwiftUI
import UIKit

/// The strip layout's palette and type roles, "chart ink": the owner's
/// pick of the redesign's looks (2026-11-04, "I like chart ink and glass
/// cockpit only"), the web app's `--ink-*` tokens (apps/web/src/index.css) in
/// the phone's own idiom. Paper under white cards by day; the night
/// scheme's dark ground and cards with a cyan tint, the same scheme the
/// theme's own dark mode is. Applied through the environment
/// (`chartInkTheme()`), so every view of the strip reads one source and a
/// view in a test can be given either scheme.
///
/// The chart's own inks name what a thing is: magenta for the course and
/// the idents at the head, brown for a checkpoint, green for a field. One
/// tint for everything tappable; amber for a caution and green for go.
/// Every value is design/tokens.json's (WingtipPalette.inkLight, .inkDark). The fonts are the system's in the same roles the
/// web's Barlow and Barlow Condensed play, never a bundled font: SF Pro
/// for text, its condensed width with letterspaced capitals for the
/// figures' labels, idents and buttons.
struct ChartInk: Equatable, Sendable {
    /// The sheet's ground and a card's surface.
    let paper: Color
    let card: Color
    /// The course's magenta, a checkpoint's brown, a field's green.
    let magenta: Color
    let brown: Color
    let field: Color
    /// What is flown already, on the ribbon.
    let flown: Color
    /// Everything tappable.
    let tint: Color
    let caution: Color
    let go: Color
    /// A no-go's red, as words.
    let stop: Color
    /// Words, and the quieter words.
    let ink: Color
    let muted: Color
    let night: Bool

    /// By day: paper under white cards, the chart's magenta, brown and
    /// green; the app's blue tint, which reads 4.5:1 on the paper.
    static let light = ChartInk(WingtipPalette.inkLight, night: false)

    /// At night: the charcoal ground and cards, the light teal tint, a
    /// lighter magenta, each 4.5:1 and more on the dark card (WCAG 1.4.3).
    static let night = ChartInk(WingtipPalette.inkDark, night: true)

    /// The scheme for the appearance.
    static func scheme(dark: Bool) -> ChartInk { dark ? night : light }

    /// The strip in the Native look: iOS's grouped grounds and labels
    /// (WingtipPalette.nativeLight, .nativeDark, system colours by name)
    /// and the accent an untinted control draws in (Color.accentColor), the
    /// chart's inks and the states kept as they are, being aviation's
    /// rather than the look's.
    static func native(dark: Bool) -> ChartInk {
        let ink = scheme(dark: dark)
        let p = dark ? WingtipPalette.nativeDark : WingtipPalette.nativeLight
        return ChartInk(paper: Color(uiColor: p.sheet), card: Color(uiColor: p.card), magenta: ink.magenta, brown: ink.brown, field: ink.field,
                        flown: ink.flown, tint: .accentColor, caution: ink.caution, go: ink.go, stop: ink.stop,
                        ink: Color(uiColor: p.foreground), muted: Color(uiColor: p.mutedForeground), night: dark)
    }

    /// The same inks with the picked look's tint (Look): the brand's blue
    /// unless the pilot picked Glass Cockpit or Chart Ink in Setup.
    func tinted(_ tint: Color) -> ChartInk {
        ChartInk(paper: paper, card: card, magenta: magenta, brown: brown, field: field, flown: flown, tint: tint,
                 caution: caution, go: go, stop: stop, ink: ink, muted: muted, night: night)
    }

    /// A finding's colour on the strip: go, caution, no-go; the rest muted.
    func finding(_ finding: String) -> Color {
        switch finding {
        case "ok": return go
        case "caution": return caution
        case "stop": return stop
        default: return muted
        }
    }

    // MARK: Type roles

    /// Text at 17, 15 and 13 points: the system's body, subheadline and
    /// footnote, which follow Dynamic Type.
    static let text = WingtipType.row
    static let detail = WingtipType.detail
    static let note = WingtipType.note
    /// A figure, 26 to 40 points bold with tabular digits, scaled with
    /// Dynamic Type as Title 1 is (WingtipType.figure at its own 26).
    static func figure(_ size: CGFloat = 26) -> Font {
        Font(UIFontMetrics(forTextStyle: .title1).scaledFont(for: UIFont.systemFont(ofSize: size, weight: .bold))).monospacedDigit()
    }
    /// A section's title, as the app's 20-point titles are.
    static let heading = WingtipType.heading
}

extension ChartInk {
    /// The ink look's palette (design/tokens.json color.look.ink, generated
    /// into WingtipPalette): the web's Chart ink by day and at night, the
    /// same values on every platform.
    init(_ p: WingtipPalette, night: Bool) {
        self.init(
            paper: Color(uiColor: p.background), card: Color(uiColor: p.card),
            magenta: Color(uiColor: p.inkMagenta), brown: Color(uiColor: p.inkBrown), field: Color(uiColor: p.inkField),
            flown: Color(uiColor: WingtipColor.Strip.flown),
            tint: Color(uiColor: p.tint), caution: Color(uiColor: p.caution), go: Color(uiColor: p.go), stop: Color(uiColor: p.destructiveInk),
            ink: Color(uiColor: p.foreground), muted: Color(uiColor: p.mutedForeground), night: night)
    }
}

private struct ChartInkKey: EnvironmentKey {
    static let defaultValue = ChartInk.light
}

extension EnvironmentValues {
    /// The strip's palette for the appearance the view is drawn in.
    var chartInk: ChartInk {
        get { self[ChartInkKey.self] }
        set { self[ChartInkKey.self] = newValue }
    }
}

/// The theme put in the environment for the appearance, and the tint set
/// for every control under it, none in Native (Look.isStock).
private struct ChartInkTheme: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @AppStorage(Look.key) private var look = Look.standard.rawValue

    func body(content: Content) -> some View {
        let dark = scheme == .dark
        let picked = Look(rawValue: look) ?? .standard
        let ink = picked.isStock ? ChartInk.native(dark: dark) : ChartInk.scheme(dark: dark).tinted(Color(uiColor: picked.tint(dark: dark)))
        content
            .environment(\.chartInk, ink)
            .tint(picked.isStock ? nil : ink.tint)
    }
}

/// The condensed letterspaced capitals of a label, an ident or a chip's
/// words: the web's Barlow Condensed role, in SF Pro's condensed width.
/// In Native (Look.isStock) the text style as the system sets it, in its
/// own width, case and spacing.
private struct CondensedCaps: ViewModifier {
    let size: Font.TextStyle
    let weight: Font.Weight
    @Environment(\.look) private var look

    func body(content: Content) -> some View {
        let stock = look.isStock
        content
            .font(Font.system(size, design: .default).weight(weight))
            .fontWidth(stock ? nil : .condensed)
            .textCase(stock ? nil : .uppercase)
            .tracking(stock ? 0 : WingtipType.labelTracking)
    }
}

/// A card of the strip: 18-point corners, the card's colour on the
/// paper, a hair of shadow (the canvas's boards: "white cards with a
/// 4 px shadow, 18 px corners"). In Native (Look.isStock) no shadow, and
/// the 10-point corner of the system's own grouped box (GroupBox, an inset
/// grouped list's cell), on the system's grouped ground.
private struct InkCard: ViewModifier {
    @Environment(\.chartInk) private var ink
    @Environment(\.look) private var look

    func body(content: Content) -> some View {
        if look.isStock {
            content.background(ink.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else {
            content
                .background(ink.card, in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
                .shadow(color: Color.black.opacity(ink.night ? 0.3 : 0.08), radius: 4, x: 0, y: 1)
        }
    }
}

extension View {
    func chartInkTheme() -> some View { modifier(ChartInkTheme()) }

    /// Condensed letterspaced capitals: a figure's label at the caption
    /// size, an ident or a chip's words at the footnote's.
    func condensedCaps(_ size: Font.TextStyle = .footnote, weight: Font.Weight = .semibold) -> some View {
        modifier(CondensedCaps(size: size, weight: weight))
    }

    func inkCard() -> some View { modifier(InkCard()) }
}
