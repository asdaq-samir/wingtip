import Foundation

/// The SF Symbol for each concept of the shared icon table
/// (docs/design/icons.md): one concept, one shape on every app, the web's
/// ICON (apps/web/src/lib/icons.ts) and Android's the same. A screen asks
/// for the concept, never the glyph's name, so a concept's glyph changes
/// here once.
enum WingtipIcon {
    static let close = "xmark"
    static let share = "square.and.arrow.up"
    static let more = "ellipsis.circle"
    static let myLocation = "location"
    static let myLocationOn = "location.fill"
    static let brief = "sparkles"
    static let navLog = "list.number"
    static let profile = "chart.xyaxis.line"
    static let mapLayers = "map"
    static let flightPlan = "point.topleft.down.to.point.bottomright.curvepath"
    static let nearest = "scope"
    /// Direct To and Fly Here: the chart's D-arrow is drawn on the web; the
    /// nearest system shape is the arrow up and right.
    static let directTo = "arrow.up.right"
    static let addToRoute = "mappin.and.ellipse"
    static let holdHere = "arrow.triangle.2.circlepath"
    static let call = "phone"
    static let address = "mappin"
    static let copy = "doc.on.doc"
    /// A Favorite: the star, filled while the thing is one.
    static let favorite = "star"
    static let send = "paperplane"

    // The one search's rows and the airport card's (the one-search
    // design, 2026-11-09): what was each tab's glyph is now its kind's.
    static let departFrom = "airplane.departure"
    static let airplane = "airplane"
    static let settings = "gearshape"
    static let account = "person.crop.circle"
    /// Ask by voice: the pilot speaking to the app (VoiceInput).
    static let microphone = "mic"
    /// The radio listened to (ClearanceListener): its own mark, never the
    /// mic's (the owner, 2026-11-10).
    static let radio = "antenna.radiowaves.left.and.right"
    static let ask = "sparkles"
    static let waypoint = "triangle"
}
