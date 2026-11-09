import SwiftUI

/// "Pick an airplane", where a figure would be that only an airplane has
/// (its glide, its time, its fuel, its weight and balance): the existing
/// airplane picker (AircraftView) opened over the screen, nothing moved.
/// With no airplane picked no airplane's figure is shown, and none is
/// assumed (the owner, 2026-11-09).
struct PickAirplaneRow: View {
    /// What the airplane would give here, under the title.
    var detail: String
    @State private var picking = false

    var body: some View {
        Button { picking = true } label: {
            CardRow(title: "Pick an Airplane", detail: detail) {
                Image(systemName: "chevron.right").foregroundStyle(.tertiary).accessibilityHidden(true)
            }
        }
        .sheet(isPresented: $picking) { AircraftView() }
    }
}

#Preview("PickAirplaneRow") {
    List { PickAirplaneRow(detail: "Its glide and landing figures rank the fields") }
        .environment(Plan())
}
