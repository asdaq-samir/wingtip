import SwiftUI

/// A status a pilot scans a list or a card for, as a badge: the web's
/// StatusBadge (components/StatusBadge; docs/design/rules.md §9, the owner,
/// 2026-11-14: "Use badges where we can for example tfr active etc."). Each
/// a fill from design/tokens.json's color.badge.status-* under white words
/// at 4.5:1 or more, its word in the badge type role (iOS's Caption 1,
/// semibold). The word is the badge's own text, so VoiceOver reads it; the
/// words that explain it (until when, how far) stay text beside it.
enum BadgeStatus: String, CaseIterable, Sendable {
    /// In force now: a TFR, a NOTAM, a special-use area hot.
    case active
    /// In force later, not yet.
    case later
    /// Scheduled but not in use now: a special-use area cold.
    case cold
    /// Closed by NASR or a NOTAM (decision 0043): never shown as open.
    case closed
    /// A navaid or a service not working.
    case outOfService
    /// Who may use a field, where it is not public (NASR's use and ownership).
    case privateUse, military, joint
    /// A tracked airplane: flying, on the ground, squawking an emergency.
    case inAir, ground, emergency

    /// The word it says when the caller gives none (the web's STATUS).
    var word: String {
        switch self {
        case .active: "Active"
        case .later: "Later"
        case .cold: "Cold"
        case .closed: "Closed"
        case .outOfService: "Out of service"
        case .privateUse: "Private"
        case .military: "Military"
        case .joint: "Joint use"
        case .inAir: "In the air"
        case .ground: "On the ground"
        case .emergency: "Emergency"
        }
    }

    /// Its fill, the token's.
    var fill: UIColor {
        switch self {
        case .active: WingtipColor.Badge.statusActive
        case .later: WingtipColor.Badge.statusLater
        case .cold: WingtipColor.Badge.statusCold
        case .closed: WingtipColor.Badge.statusClosed
        case .outOfService: WingtipColor.Badge.statusOutOfService
        case .privateUse: WingtipColor.Badge.statusPrivate
        case .military: WingtipColor.Badge.statusMilitary
        case .joint: WingtipColor.Badge.statusJoint
        case .inAir: WingtipColor.Badge.air
        case .ground: WingtipColor.Badge.statusGround
        case .emergency: WingtipColor.Badge.statusEmergency
        }
    }

}

/// The badge itself: a capsule in the status's fill, its word in white.
/// `words` says more where the status needs it ("Active until 2200Z").
struct StatusBadge: View {
    let status: BadgeStatus
    var words: String?

    init(_ status: BadgeStatus, words: String? = nil) {
        self.status = status
        self.words = words
    }

    var body: some View {
        Text(words ?? status.word)
            .font(WingtipType.badge)
            .foregroundStyle(.white)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, WingtipSpace.sm)
            .padding(.vertical, WingtipSpace.xxs)
            .background(Color(uiColor: status.fill), in: .capsule)
    }
}

/// A flight category as a badge (AIM 7-1-7), in the FAA's chip colour
/// under white words, as the web's StatusBadge `category` form; "≈"
/// before it where it is not the field's own report, said as "about".
struct CategoryBadge: View {
    let category: String
    var approximate = false

    var body: some View {
        Text(approximate ? "≈ \(category)" : category)
            .font(WingtipType.badge.bold())
            .foregroundStyle(.white)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, WingtipSpace.sm)
            .padding(.vertical, WingtipSpace.xxs)
            .background(Color(uiColor: FlightCategory.words(category)), in: .capsule)
            .accessibilityLabel(approximate ? "about \(SpokenFigures.flightCategory(category))" : SpokenFigures.flightCategory(category))
    }
}

#Preview("StatusBadge") {
    VStack(alignment: .leading, spacing: WingtipSpace.sm) {
        ForEach(BadgeStatus.allCases, id: \.self) { StatusBadge($0) }
        CategoryBadge(category: "MVFR")
        CategoryBadge(category: "IFR", approximate: true)
    }
    .padding()
}
