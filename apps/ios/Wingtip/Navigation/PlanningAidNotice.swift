import SwiftUI

/// What the app is, said once at first launch before anything else, as a
/// stock alert the pilot accepts (the store audit's S2: App Review 5.1.5
/// asks that location not be offered as an emergency service or control
/// of an aircraft, and a moving map reads as navigation): the planning-aid
/// words every app says (PlanningAid, docs/legal/credits.md) and the
/// listing's "Not for navigation" (docs/store/listing.md). Shown again
/// nowhere; the same words stay in About.
enum PlanningAidNotice {
    static let acceptedKey = "planningAidAccepted"
    static let title = "A Planning Aid, Not for Navigation"
    /// docs/store/listing.md's paragraph, word for word.
    static let notForNavigation = "Not for navigation: the map, your airplane on it, the traffic and the alerts are for awareness, not a replacement for the airplane's instruments and approved navigation equipment."
    static var message: String { PlanningAid.words + "\n\n" + notForNavigation }

    /// Whether it is wanted at launch: not once accepted, not under the
    /// UI tests' and the store pictures' launch arguments, as the first
    /// flight's card is not (FirstFlightModel.shown), and not in the app that hosts the
    /// unit tests, where an alert over the window broke tests that
    /// present their own (SiriEntitiesTests, run 42963111467);
    /// `-planningAid` asks for it.
    static func wanted(defaults: UserDefaults = .standard, arguments: [String] = CommandLine.arguments,
                       environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
        if arguments.contains("-planningAid") { return !defaults.bool(forKey: acceptedKey) }
        if environment["XCTestConfigurationFilePath"] != nil { return false }
        if arguments.contains(where: { ["-screen", "-layout", "-fresh"].contains($0) }) { return false }
        return !defaults.bool(forKey: acceptedKey)
    }
}

/// The notice, hung on the top of the stack with the other questions
/// (TopHosts), so it shows over the plan's sheet; one instance is active
/// at a time, and the accepted key, shared by all, puts every one away.
/// Its one button accepts it.
struct PlanningAidAlert: ViewModifier {
    let active: Bool
    @AppStorage(PlanningAidNotice.acceptedKey) private var accepted = false
    private static let launchWants = PlanningAidNotice.wanted()

    func body(content: Content) -> some View {
        content.alert(PlanningAidNotice.title, isPresented: Binding(get: { active && !accepted && Self.launchWants }, set: { _ in })) {
            Button("I Understand") {
                accepted = true
            }
        } message: {
            Text(PlanningAidNotice.message)
        }
    }
}
