import MapKit

// MARK: - When to ask again

/// The view's box as south, west, north, east.
struct ViewBox: Equatable, Sendable {
    var south, west, north, east: Double

    init(south: Double, west: Double, north: Double, east: Double) {
        (self.south, self.west, self.north, self.east) = (south, west, north, east)
    }

    init(_ region: MKCoordinateRegion) {
        self.init(south: region.center.latitude - region.span.latitudeDelta / 2,
                  west: region.center.longitude - region.span.longitudeDelta / 2,
                  north: region.center.latitude + region.span.latitudeDelta / 2,
                  east: region.center.longitude + region.span.longitudeDelta / 2)
    }

    /// The box grown by half of itself on every side: what is asked for,
    /// so a pan within it asks nothing.
    var widened: ViewBox {
        let dLat = (north - south) / 2, dLon = (east - west) / 2
        return ViewBox(south: max(-90, south - dLat), west: max(-180, west - dLon), north: min(90, north + dLat), east: min(180, east + dLon))
    }

    func holds(_ other: ViewBox) -> Bool {
        other.south >= south && other.north <= north && other.west >= west && other.east <= east
    }
}

/// What was last asked for the view, as the web map's useGlView asks during
/// a gesture: again when the whole level changes or the view leaves the
/// box asked for, at most once a frame, and not otherwise.
struct ViewFetch: Equatable, Sendable {
    private(set) var box: ViewBox?
    private(set) var level: Int?

    /// Whether a view at this zoom wants a new answer.
    func wants(_ view: ViewBox, zoom: Double) -> Bool {
        guard let box, let level else { return true }
        return Int(zoom.rounded(.down)) != level || !box.holds(view)
    }

    /// The box to ask for, kept as asked.
    mutating func ask(_ view: ViewBox, zoom: Double) -> ViewBox {
        let wide = view.widened
        box = wide
        level = Int(zoom.rounded(.down))
        return wide
    }

    mutating func forget() { box = nil; level = nil }
}

/// What the map at rest last asked for its fields (ChartMap's rested ask,
/// the planner's /api/airports/in-view or the packs): again when the view
/// leaves the widened box or its level, or the answer is ten minutes old,
/// as FieldWeatherFeed asks. Following own ship, MapKit's camera comes to
/// rest at every fix, once a second; without this each rest asked for the
/// same fields again.
struct RestedFetch: Equatable, Sendable {
    /// Ten minutes, FieldWeatherFeed's: the fields' categories are a
    /// METAR's, which change by the hour.
    static let every: TimeInterval = 10 * 60
    /// The planner's most (its in-view `limit`): the box asked is four
    /// views, so its share for the view stays near the 300 asked for one.
    static let most = 1000

    private(set) var fetch = ViewFetch()
    private(set) var askedAt = Date.distantPast

    func wants(_ view: ViewBox, zoom: Double, now: Date = Date()) -> Bool {
        fetch.wants(view, zoom: zoom) || now.timeIntervalSince(askedAt) >= Self.every
    }

    /// The box to ask for, kept as asked.
    mutating func ask(_ view: ViewBox, zoom: Double, now: Date = Date()) -> ViewBox {
        askedAt = now
        return fetch.ask(view, zoom: zoom)
    }

    /// Nothing came back: the next rest asks again.
    mutating func forget() {
        fetch.forget()
        askedAt = .distantPast
    }
}
