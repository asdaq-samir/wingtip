import Foundation

/// What an alert on the map is about, opened when it is tapped (tap what
/// you see, docs/navigation.md): a field's card, or the airspace card at
/// the point the alert is at, as a point held on the map opens it.
enum AlertTarget: Equatable, Sendable {
    case field(String)
    case place(lat: Double, lon: Double)

    /// The Airport tab's route to it (AirportRoute's text).
    var route: String {
        switch self {
        case .field(let ident): ident
        case .place(let lat, let lon): AirportRoute.airspace(lat: lat, lon: lon).text
        }
    }
}

/// An alert's one fix, where the engine gave one: Direct To the field it
/// picked (the copilot's alternative, best_fields' diversion pick).
/// Nothing is worked out here; with no pick, no fix is offered.
enum AlertFix: Equatable, Sendable {
    case directTo(String)

    var label: String {
        switch self {
        case .directTo(let ident): "Direct To \(ident)"
        }
    }
}

/// Where each alert leads and its fix, read from what the planner and the
/// engine sent: the alerts ahead (the planner's, at a point on the track)
/// and the copilot's messages (the engine's copilot_watch, whose ids name
/// the field they are about: "weather:KDLH:ifr", "itws:KORD:…",
/// "fuel:KHIB", "night:KDLH").
enum AlertActions {
    static func target(_ alert: AheadAlert) -> AlertTarget {
        .place(lat: alert.lat, lon: alert.lon)
    }

    /// The kinds whose id's second part is the field: "closed:00MO", the
    /// destination NASR lists as closed (decision 0043), opens its card,
    /// labelled so, and its fix is Direct To the engine's alternative.
    static let fieldKinds: Set<String> = ["weather", "itws", "fuel", "closed", "night"]

    static func target(_ message: Copilot.Message) -> AlertTarget? {
        let parts = message.id.split(separator: ":", maxSplits: 2).map(String.init)
        if fieldKinds.contains(message.kind), parts.count > 1, !parts[1].isEmpty { return .field(parts[1]) }
        return message.alternative.map { .field($0.ident) }
    }

    static func fix(_ message: Copilot.Message) -> AlertFix? {
        message.alternative.map { .directTo($0.ident) }
    }

    /// Opened by the one way in, as a route point's More Info opens a card.
    static func command(_ target: AlertTarget) -> AppCommand {
        .weather(ident: target.route)
    }

    /// Taken by the one way in: Direct To from where the airplane is, as
    /// Siri's Direct To is (RootView.apply).
    static func command(_ fix: AlertFix) -> AppCommand {
        switch fix {
        case .directTo(let ident): .directTo(place: ident)
        }
    }
}
