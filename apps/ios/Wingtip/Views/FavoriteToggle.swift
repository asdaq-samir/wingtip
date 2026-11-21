import SwiftUI

/// An airplane's Favorite in a card's row of glass actions (AirplaneCard,
/// AirplanePlaceHead): the star filled in the taxiway's yellow while it is
/// kept, the stock button-style Toggle, named by what a tap does.
struct FavoriteToggle: View {
    let starred: Bool
    let toggle: () -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { starred }, set: { _ in toggle() })) {
            ActionFace(systemImage: starred ? "\(WingtipIcon.favorite).fill" : WingtipIcon.favorite, title: "Favorite",
                       symbolColour: starred ? Color(uiColor: WingtipColor.Brand.taxiwayYellow) : nil)
        }
        .toggleStyle(.button)
        .glassButton()
        .accessibilityLabel(starred ? Wording.removeFromFavorites : Wording.addToFavorites)
    }
}
