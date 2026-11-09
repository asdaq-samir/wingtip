import SwiftUI
import WidgetKit

/// The widget extension: the next flight on the Home Screen and the Lock
/// Screen (FlightWidget, FlightWidgets.swift), and the flight in progress
/// on the Lock Screen and in the Dynamic Island (a Live Activity, the
/// owner's ask of 2026-11-03, as Apple recommends for anything ongoing:
/// FlightActivityWidget); and Start Flight, Nearest Airport and Emergency in
/// Control Center and on the Lock Screen (FlightControl, OpenControls.swift:
/// iOS 18's controls). Only the Shared folder's files, the tokens and
/// Format are compiled with the app; the views here draw from the
/// attributes' content state and the App Group's snapshot alone.
@main
struct WingtipWidgetsBundle: WidgetBundle {
    var body: some Widget {
        FlightWidget()
        FlightActivityWidget()
        FlightControl()
        NearestAirportControl()
        EmergencyControl()
    }
}
