import CoreLocation
import Foundation

/// What the Airport tab's stack holds, written as the strings the root
/// view hands it (RootView's `airports`): a field's ident for its card,
/// "@lat,lon" for the airspace over a point held on the map, "~list" for
/// a strip's list in full, "#lat,lon|label" for the fields nearest a
/// place typed in the search, and "%fuel" for Find Nearby's fields of a
/// kind round the airplane.
enum AirportRoute: Hashable, Sendable {
    case airport(String)
    case airspace(lat: Double, lon: Double)
    case list(AirportShelf.Shows)
    case nearFrom(lat: Double, lon: Double, label: String)
    case nearby(StopKind)

    init(_ text: String) {
        if text.hasPrefix("@"), let at = Self.point(text.dropFirst()) {
            self = .airspace(lat: at.lat, lon: at.lon)
        } else if text.hasPrefix("~"), let shows = AirportShelf.Shows(rawValue: String(text.dropFirst())) {
            self = .list(shows)
        } else if text.hasPrefix("%"), let kind = StopKind(rawValue: String(text.dropFirst())) {
            self = .nearby(kind)
        } else if text.hasPrefix("#"), let bar = text.firstIndex(of: "|"),
                  let at = Self.point(text[text.index(after: text.startIndex)..<bar]) {
            self = .nearFrom(lat: at.lat, lon: at.lon, label: String(text[text.index(after: bar)...]))
        } else {
            self = .airport(text)
        }
    }

    var text: String {
        switch self {
        case .airport(let ident): ident
        case .airspace(let lat, let lon): "@" + AirportWords.point(lat, lon)
        case .list(let shows): "~" + shows.rawValue
        case .nearFrom(let lat, let lon, let label): "#" + AirportWords.point(lat, lon) + "|" + label
        case .nearby(let kind): "%" + kind.rawValue
        }
    }

    /// The field whose card this is, for its ring on the chart.
    var field: String? {
        if case .airport(let ident) = self { return ident }
        return nil
    }

    /// The point a held finger marks on the map, for its pin.
    var heldPoint: CLLocationCoordinate2D? {
        if case .airspace(let lat, let lon) = self { return CLLocationCoordinate2D(latitude: lat, longitude: lon) }
        return nil
    }

    private static func point(_ text: Substring) -> (lat: Double, lon: Double)? {
        let parts = text.split(separator: ",")
        guard parts.count == 2, let lat = Double(parts[0]), let lon = Double(parts[1]),
              abs(lat) <= 90, abs(lon) <= 180 else { return nil }
        return (lat, lon)
    }
}
