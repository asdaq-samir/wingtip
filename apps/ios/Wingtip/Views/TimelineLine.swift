import SwiftUI

/// A point's mark on FPL's timeline, as Apple Maps' Directions draw theirs
/// (the web's TimelineMark; the owner, 2026-11-17 and 20): a filled circle
/// with a white glyph -- an airport's "•••" in its flight category's colour
/// (the map's, grey with no report), a fuel stop's the pump, a waypoint a
/// grey triangle, the airplane's position the tint with the location arrow,
/// one that cannot be flown to the problem's red with ✕. The mark is the
/// point's menu (RoutePointActions), and its dots say so.
struct TimelineMark: View {
    let point: TimelinePoint
    let problem: Bool
    let category: String?
    @ScaledMetric(relativeTo: .body) private var size = WingtipSize.chip

    var body: some View {
        Image(systemName: glyph)
            .font(WingtipType.note.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(fill, in: Circle())
            // A category's fill cased as the map's dots are (CategoryCasing,
            // the web's DOT_RING): IFR's blue and LIFR's purple under 3:1 on
            // the night's navy and LIFR's on the day's muted fills alone.
            .modifier(Cased(on: category != nil && point.field && !problem && !point.position))
    }

    private var glyph: String {
        if problem { return WingtipIcon.close }
        if point.position { return "location.fill" }
        if !point.field { return "triangle.fill" }
        return point.fuelStop ? "fuelpump.fill" : "ellipsis"
    }

    private var fill: Color {
        if problem { return WingtipInk.problem }
        if point.position { return .accentColor }
        if !point.field { return Color(uiColor: .systemGray) }
        return Color(uiColor: FlightCategory.mark(category))
    }
}

/// The category's casing on a field's mark, none on the others'.
private struct Cased: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.categoryCased() } else { content }
    }
}

/// The route's magenta through the marks' column, one solid line from the
/// line before into the line after (the web's TIMELINE_THREAD): from the
/// row's top to its mark's middle where a line comes before it, and from
/// the middle to the row's foot where one comes after.
struct TimelineThread: View {
    let top: Bool
    let bottom: Bool
    /// The mark's middle, from the row's top.
    let mid: CGFloat

    var body: some View {
        let ink = Color(uiColor: WingtipColor.Chart.course)
        ZStack(alignment: .top) {
            if top { Rectangle().fill(ink).frame(width: 3, height: mid) }
            if bottom { Rectangle().fill(ink).frame(width: 3).padding(.top, mid) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityHidden(true)
    }
}

/// The marks' column and the words after it, as every line of the
/// timeline lays them out (a point's, a procedure's head or fix): the mark
/// centred on the first line (timelineFirstLine, both scaled with the
/// text), the thread through the column, the words from the inset where
/// the list's hairline starts (iOS's inset grouped list, as the web's
/// timeline draws it), the rows meeting edge to edge so the thread is
/// unbroken.
struct TimelineColumns<Mark: View, Words: View>: View {
    let top: Bool
    let bottom: Bool
    /// The list's hairline over the words, where the line is not the first
    /// of its list row (a procedure's rows and the field's line in one).
    var hairline = false
    @ViewBuilder let mark: Mark
    @ViewBuilder let words: Words
    @ScaledMetric(relativeTo: .body) private var line = WingtipSize.tapTarget
    @ScaledMetric(relativeTo: .body) private var column = WingtipSize.chip

    var body: some View {
        HStack(alignment: .top, spacing: WingtipSpace.lg) {
            mark.frame(width: column, height: line)
            words
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { if hairline { Divider() } }
                .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
        }
        .background(alignment: .topLeading) {
            TimelineThread(top: top, bottom: bottom, mid: line / 2).frame(width: column)
        }
    }
}

/// A timeline line's first line: as tall as the marks' line, 44 points at
/// the default text size and scaled with it, its words centred in it.
private struct TimelineFirstLine: ViewModifier {
    @ScaledMetric(relativeTo: .body) private var line = WingtipSize.tapTarget

    func body(content: Content) -> some View {
        content.frame(minHeight: line)
    }
}

extension View {
    /// This view is its timeline line's first line, its mark centred on it.
    func timelineFirstLine() -> some View { modifier(TimelineFirstLine()) }
}
