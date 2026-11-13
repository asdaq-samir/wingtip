import SwiftUI

/// The alerts ahead said aloud, Setup's switch for it: the flight's own
/// voice (FlightSession.spoken), so what it says and this switch are one.
struct SpokenAlertsToggle: View {
    @Environment(FlightSession.self) private var flight

    var body: some View {
        Toggle("Speak Alerts Ahead", isOn: Bindable(flight.spoken).on)
    }
}

#Preview("SpokenAlertsToggle") {
    Form { SpokenAlertsToggle() }
        .environment(FlightSession())
}
