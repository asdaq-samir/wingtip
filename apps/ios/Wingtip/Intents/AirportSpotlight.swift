import AppIntents
import CoreSpotlight

/// The fields Siri and Spotlight know without asking: the kept route's,
/// the Favorites and the Recents (AirportEntityQuery.suggestedEntities),
/// indexed as App Entities so Spotlight finds "KOSH" or "Oshkosh" and
/// opens the field's card (OpenAirportIntent), and told to Siri for the
/// shortcuts' phrases. Called as the route changes (RootView).
@MainActor
enum AirportSpotlight {
    private static var indexing: Task<Void, Never>?

    static func refresh() {
        WingtipShortcuts.updateAppShortcutParameters()
        indexing?.cancel()
        indexing = Task {
            // Spotlight is a convenience: a field it misses is still found
            // by Siri's query, so a failed index is logged, not shown.
            do {
                let fields = try await AirportEntityQuery().suggestedEntities()
                guard !Task.isCancelled else { return }
                try await CSSearchableIndex.default().indexAppEntities(fields)
            } catch {
                Log.app.error("the airports could not be indexed for Spotlight: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}

/// A field in Spotlight: its ident, its name and its town to search by.
extension AirportEntity: IndexedEntity {
    var attributeSet: CSSearchableItemAttributeSet {
        let set = CSSearchableItemAttributeSet()
        set.displayName = name.isEmpty ? id : "\(id) · \(name)"
        set.contentDescription = city
        set.keywords = [id, name, city].compactMap { $0 }.filter { !$0.isEmpty }
        return set
    }
}

/// A field opened from Spotlight or a Shortcut: its card, for its
/// weather, its runways and its frequencies (RootView's `.weather`).
struct OpenAirportIntent: OpenIntent, CommandIntent {
    static let title: LocalizedStringResource = "Open an Airport"
    static let description = IntentDescription("Opens an airport's card: its weather, runways and frequencies.")

    @Parameter(title: "Airport")
    var target: AirportEntity

    /// What the app is left to do for the field: its card.
    static func command(_ target: AirportEntity) -> AppCommand { .weather(ident: target.id) }

    func appCommand() -> AppCommand? { Self.command(target) }

    func perform() async throws -> some IntentResult {
        return .result()
    }
}
