import SwiftUI

/// An airplane card's four actions, the web's AirplaneCard Actions (the
/// owner's design of 2026-11-26; on the phones since 2026-11-27: "Yes,
/// match the web"): in the air Track, filled, the map keeping it in sight;
/// on the ground Fly This for an airplane the planner can fly; then Alerts
/// (takes off, lands), Favorite, and Figures, its planning figures' page.
/// Always the four, in their places, from the generated table
/// (design/card-actions.json's airplane and airplaneAirborne), one greyed
/// where it does nothing for this airplane, never hidden (the owner,
/// 2026-11-27: "Keep four buttons on top, just disable the one when
/// needed"). Both airplane cards draw it: AirplaneCard by the ICAO address
/// and AirplaneProfileView by the N-number.
struct AirplaneActions: View {
    @Environment(Tracking.self) private var tracking
    @Environment(\.undoManager) private var undoManager
    let state: AirplaneActionState
    /// Track pressed or let go: the map keeps it in sight or not.
    let follow: @MainActor (Bool) -> Void
    let fly: @MainActor () -> Void
    let figures: @MainActor () -> Void

    var body: some View {
        HStack(spacing: WingtipSpace.sm) {
            ForEach(state.kind.actions, id: \.self) { action in
                tile(action).accessibilityIdentifier(Self.identifier(action))
            }
        }
        .glassGroup(spacing: WingtipSpace.sm)
        // Four across the phone, a glyph over a word, to the second
        // accessibility size, where the words would no longer fit.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    /// Each tile's name for the UI tests, the web's test id for the same tile.
    static func identifier(_ action: CardAction) -> String {
        switch action {
        case .track: "airplane-track"
        case .flyThis: "fly-this-airplane"
        case .alerts: "airplane-alerts"
        case .favorite: "airplane-favorite"
        case .figures: "airplane-figures-open"
        default: action.rawValue
        }
    }

    /// One tile's wiring: what a tap does, and whether it can be done now.
    @ViewBuilder private func tile(_ action: CardAction) -> some View {
        switch action {
        case .track:
            Toggle(isOn: Binding(get: { state.following }, set: follow)) {
                ActionFace(systemImage: action.systemImage, title: action.title)
            }
            .toggleStyle(.button)
            .glassProminentButton()
            .disabled(!state.trackable)
            // The pressed state says whether the map keeps it in sight; the
            // visible word in its name (WCAG 2.5.3).
            .accessibilityLabel("\(action.title) \(state.name) on the map")
        case .flyThis:
            Button(action: fly) {
                ActionFace(systemImage: action.systemImage, title: state.flying ? "Flying This" : action.title)
            }
            .glassProminentButton()
            .disabled(state.flying || !state.flyable)
            .accessibilityLabel(state.flying ? String(localized: "Flying This Airplane") : Wording.flyThisAirplane)
        case .alerts:
            let set = state.hex.map { tracking.watching($0, .takeoff) || tracking.watching($0, .land) } ?? false
            Menu {
                if let hex = state.hex {
                    Toggle("Tell Me When It Takes Off", isOn: watch(hex, .takeoff))
                    Toggle("Tell Me When It Lands", isOn: watch(hex, .land))
                }
            } label: {
                ActionFace(systemImage: set ? "\(action.systemImage).fill" : action.systemImage, title: action.title)
            }
            .glassButton()
            // By the ICAO address: greyed for an N-number the registry gives none.
            .disabled(state.hex == nil)
        case .favorite:
            FavoriteToggle(starred: state.hex.map(tracking.isFavorite) ?? false) {
                if let kept = state.kept { tracking.toggleFavorite(kept, undo: undoManager) }
            }
            .disabled(state.kept == nil)
        case .figures:
            Button(action: figures) { ActionFace(systemImage: action.systemImage, title: action.title) }
                .glassButton()
                .disabled(!state.flyable)
        default: EmptyView()
        }
    }

    private func watch(_ hex: String, _ kind: AirplaneWatch.Kind) -> Binding<Bool> {
        Binding(get: { tracking.watching(hex, kind) }, set: { _ in tracking.toggleWatch(AirplaneWatch(hex: hex, name: state.name, kind: kind)) })
    }
}

/// What the four actions need to know of an airplane, worked out by each
/// card from what it has: a value, so the row's rules are tested without
/// a view (AirplaneActionsTests).
struct AirplaneActionState: Equatable {
    /// Its name as the card's head says it, for the spoken labels and its alerts.
    var name: String
    /// Its ICAO address, lowercased: its alerts and its Favorite go by it.
    var hex: String?
    /// In the air: Track in Fly This's place.
    var airborne: Bool
    /// Heard now, so there is a place to keep in sight.
    var heard: Bool
    /// The map keeps this airplane in sight now.
    var tracked: Bool
    /// The N-number the plan would fly, where it has one.
    var tail: String?
    /// The planner has a book for its registered type.
    var booked: Bool
    /// One of the pilot's airplanes.
    var owned: Bool
    /// The plan flies it now.
    var flying: Bool
    /// The airplane kept as a Favorite or a Recent.
    var kept: KeptAirplane?

    /// The row's kind (design/card-actions.json), by its state.
    var kind: CardKind { airborne ? .airplaneAirborne : .airplane }
    var trackable: Bool { heard }
    var following: Bool { heard && tracked }
    /// Fly This and Figures: an N-number with a book for its type, one of
    /// the pilot's own, or the one flown (the web's flyable); a type the
    /// planner has no book for flies on the pilot's figures alone, never
    /// another airplane's (the owner, 2026-11-09).
    var flyable: Bool { tail != nil && (booked || owned || flying) }
}
