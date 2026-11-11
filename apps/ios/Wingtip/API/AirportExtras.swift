import Foundation

// The planner's answers an airport's card and the map read beyond the
// card itself, generated from services/planner/openapi.json
// (Generated/PlannerModels.swift): the names the app uses are typealiases
// here, with what it adds as extensions.

/// The nearest station's report, for a field with none of its own
/// (NearbyMetar, wingtip.weather.nearest_report): within 30 nm, `near` where
/// within the ten statute miles a report is said of.
typealias NearbyMetar = APINearbyMetar

/// One of a field's charts in the d-TPP (TerminalChart, wingtip.publications):
/// `kind` the FAA's chart code -- APD the airport diagram, HOT its hot
/// spots, LAH land and hold short, IAP an approach, DP and ODP a
/// departure, STR an arrival, MIN the takeoff or alternate minimums --
/// `name` its title as the FAA prints it, `url` its PDF.
typealias TerminalChart = APITerminalChart

extension TerminalChart: Identifiable {
    var id: String { url }
}

/// A runway's end (RunwayEnd): its true heading, and the side its traffic
/// pattern turns to.
typealias RunwayEnd = APIRunwayEnd

/// The pictures behind the card's diagram (AirportPhotos): the USGS's
/// aerial of every field, and a free photo from the ground where
/// Wikipedia has one, with its photographer and licence.
typealias GroundPhoto = APIGroundPhoto
typealias AirportPhotos = APIAirportPhotos

/// A place to eat, sleep or hire a car near a field (NearbyPlace,
/// Overture Maps via wingtip.nearby).
typealias NearbyPlace = APINearbyPlace

extension NearbyPlace: Identifiable {
    var id: String { "\(name)-\(lat)-\(lon)" }
}

/// What a field offers a pilot who lands there (AirportServices): from
/// its Chart Supplement entry the fuel, fees, parking, repair and oxygen,
/// and from Overture the places within five miles. `nearbyUnavailable`
/// where Overture could not be read, which is not the same as nothing near.
typealias AirportServices = APIAirportServices

/// 91.155's VFR weather minimums for a band, by day or by night
/// (VfrMinimums), as the planner reads them for the class and height.
typealias VfrMinimums = APIVfrMinimums
typealias DayNightMinimums = APIDayNightMinimums

/// One class of airspace over a point, floor to ceiling in feet MSL
/// (AirspaceBand), with what it takes to go in, in the planner's words;
/// its `class`, A to G, is airspaceClass.
typealias AirspaceBand = APIAirspaceBand

extension AirspaceBand: Identifiable {
    var id: String { "\(floorFt)-\(airspaceClass)" }
}

/// A Class B's Mode C veil the point is in (ModeCVeil).
typealias ModeCVeil = APIModeCVeil

/// The point named off its nearest fix, "VPBNG/095/14.2" (PointOffFix,
/// wingtip.fixes.frd_near).
typealias PointOffFix = APIPointOffFix

/// A special-use area over the point (SpecialUse), as the FAA's file has it.
typealias SpecialUse = APISpecialUse

extension SpecialUse: Identifiable {
    var id: String { name }
}

/// A TFR over the point now or to come (TfrHere).
typealias TfrHere = APITfrHere

extension TfrHere: Identifiable {
    var id: String { notamId }
}

/// The airspace over a point the pilot held a finger on (AirspaceAt).
typealias AirspaceAt = APIAirspaceAt

/// A town, a street address or an airport found by what was typed
/// (PlaceFound, the Census geocoder through the planner).
typealias PlaceFound = APIPlaceFound

extension PlaceFound: Identifiable, Hashable {
    var id: String { "\(label)-\(lat)-\(lon)" }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// A VFR waypoint in the map's view (WaypointPin).
typealias WaypointPin = APIWaypointPin

/// A Class B airport and what it reports now (ClassBAirport).
typealias ClassBAirport = APIClassBAirport

/// Where the planner places an approach plate's plan view on the chart,
/// by the FAA's own georeference in it (PlateOverlay, wingtip.plates).
typealias PlateOverlay = APIPlateOverlay

/// One page of an FAA chart, drawn by the planner as a picture
/// (ChartPage): a plate, the airport diagram, a Chart Supplement page.
typealias ChartPage = APIChartPage

extension ChartPage {
    /// The page's picture, through the gateway (web lib/diagram chartPagePicture).
    var path: String {
        let parts = [source, edition, pdf].map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? $0 }
        return "/api/faa-chart/page/\(parts[0])/\(parts[1])/\(parts[2])/\(page).png"
    }
}

extension Planner {
    /// The address of a picture the planner serves: its own paths
    /// (`/api/…`) through the gateway's proxy, and the ones it already
    /// gives as the gateway's (`/api/planner/…`, the photos') as they are.
    static func address(of path: String) -> URL {
        if let absolute = URL(string: path), absolute.scheme != nil { return absolute }
        if path.hasPrefix(Config.plannerPrefix + "/") {
            return URL(string: path, relativeTo: Config.gateway)?.absoluteURL ?? Config.gateway
        }
        return URL(string: Config.plannerPath(path), relativeTo: Config.gateway)?.absoluteURL ?? Config.gateway
    }

    /// A picture's bytes, or the planner's answer why not.
    static func picture(_ path: String) async throws -> Data {
        var request = URLRequest(url: address(of: path))
        request.setValue("image/*", forHTTPHeaderField: "Accept")
        return try await data(for: request)
    }

    /// The field from the air and from the ground (/api/airport/{ident}/photos).
    static func photos(_ ident: String) async throws -> AirportPhotos {
        try await fetch(AirportPhotos.self, "/api/airport/\(ident)/photos")
    }

    /// The field's own NOTAMs and the TFRs within 5 nm of it, the engine's
    /// ranking (/api/airport/{ident}/notams, notams_ranked).
    static func notams(_ ident: String) async throws -> APINotamsRanked {
        try await fetch(APINotamsRanked.self, "/api/airport/\(ident)/notams")
    }

    /// What the field offers on the ground (/api/airport/{ident}/services).
    static func services(_ ident: String) async throws -> AirportServices {
        try await fetch(AirportServices.self, "/api/airport/\(ident)/services")
    }

    /// The airspace over a point, from the ground up (/api/airspace/at).
    static func airspaceAt(lat: Double, lon: Double) async throws -> AirspaceAt {
        try await fetch(AirspaceAt.self, "/api/airspace/at", ["lat": String(format: "%.5f", lat), "lon": String(format: "%.5f", lon)])
    }

    /// Towns, addresses and airports by what was typed (/api/places/search).
    static func places(_ q: String) async throws -> [PlaceFound] {
        try await fetch(APIPlacesFound.self, "/api/places/search", ["q": q], timeout: read).places
    }

    /// The VFR waypoints in a box (/api/waypoints/in-view).
    static func waypoints(south: Double, west: Double, north: Double, east: Double) async throws -> [WaypointPin] {
        let box = ["south": String(south), "west": String(west), "north": String(north), "east": String(east)]
        return try await fetch(APIWaypointsInView.self, "/api/waypoints/in-view", box).waypoints
    }

    /// Every Class B airport and its weather now (/api/class-b).
    static func classB() async throws -> [ClassBAirport] {
        try await fetch(APIClassBResponse.self, "/api/class-b").airports
    }

    /// Where an approach's plate lies on the chart (/api/airport/{ident}/procedures/{id}/plate).
    static func plate(_ ident: String, procedure: String) async throws -> PlateOverlay {
        try await fetch(PlateOverlay.self, "/api/airport/\(ident)/procedures/\(procedure)/plate")
    }

    /// The plate's plan view as a picture (/api/approach-plate/{cycle}/{ident}/{id}.png).
    static func platePicturePath(cycle: String, ident: String, procedure: String) -> String {
        "/api/approach-plate/\(cycle)/\(ident)/\(procedure).png"
    }

    /// The plate's whole page as a picture, greyscale on white
    /// (/api/approach-plate-page/{cycle}/{ident}/{id}.png; PlateOverlay.page).
    static func platePagePath(cycle: String, ident: String, procedure: String) -> String {
        "/api/approach-plate-page/\(cycle)/\(ident)/\(procedure).png"
    }

    /// One of the FAA's charts as the planner draws its pages
    /// (/api/faa-chart): of a region's booklet, the field's pages alone.
    static func faaChart(url: String, airport: String) async throws -> [ChartPage] {
        try await fetch(APIChartPages.self, "/api/faa-chart", ["url": url, "airport": airport]).pages
    }

    /// The airport diagram for the cycle, whole or cropped to its runways
    /// (/api/airport-diagram/{cycle}/…).
    static func diagramPath(ident: String, cycle: String, runwaysOnly: Bool = false) -> String {
        "/api/airport-diagram/\(cycle)/\(runwaysOnly ? "runways/" : "")\(ident).png"
    }
}
