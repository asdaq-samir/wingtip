import SwiftUI

/// "Pick an airplane", where a figure would be that only an airplane has
/// (its glide, its time, its fuel, its weight and balance): the Airplane
/// page (AircraftView), pushed in the card it is in with Back, or its own
/// card from the plan (Navigator.push), nothing moved.
/// With no airplane picked no airplane's figure is shown, and none is
/// assumed (the owner, 2026-11-09).
struct PickAirplaneRow: View {
    @Environment(Navigator.self) private var nav
    /// What the airplane would give here, under the title.
    var detail: String

    var body: some View {
        Button { nav.push(.screen(.airplane)) } label: {
            CardRow(title: "Pick an Airplane", detail: detail) {
                Image(systemName: "chevron.right").foregroundStyle(.tertiary).accessibilityHidden(true)
            }
        }
    }
}

#Preview("PickAirplaneRow") {
    List { PickAirplaneRow(detail: "Its glide and landing figures rank the fields") }
        .environment(Plan())
}
