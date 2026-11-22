import SwiftUI
import UIKit

/// A picture to show full screen: what it is, how its pages are had,
/// and the credit its licence asks for.
struct ShownPicture: Identifiable {
    let id = UUID()
    let title: String
    var credit: String?
    /// The photo's page (a Commons file's), its author and licence in full: the credit links to it.
    var creditLink: URL?
    /// The kept answer it is drawn from, for its age with no signal.
    var kept: (kind: KeptForAir.Kind, key: String)?
    /// An approach plate's page as the planner placed it, for own ship on
    /// its first page (PlatePosition); nil for every other picture.
    var georeference: APIPlateGeoreference? {
        didSet { request?.georeference = georeference }
    }
    /// The same picture as a window of its own asks for it, and the key
    /// the pilot's markup on it is kept by; nil for one drawn on the
    /// device (a field's runway sketch), which has no address to ask by.
    var request: PictureRequest?
    let load: () async throws -> [UIImage]

    /// The planner's pictures by their paths.
    static func paths(_ title: String, _ paths: [String], credit: String? = nil, creditLink: URL? = nil) -> ShownPicture {
        var shown = ShownPicture(title: title, credit: credit) { try await PictureCache.images(paths) }
        shown.creditLink = creditLink
        shown.request = PictureRequest(title: title, credit: credit, creditLink: creditLink, source: .paths(paths))
        return shown
    }

    /// One of the FAA's charts by its address, its pages drawn by the
    /// planner (/api/faa-chart): a plate, the diagram, the Chart
    /// Supplement's pages for the field.
    static func faaChart(_ title: String, url: String, airport: String) -> ShownPicture {
        var shown = ShownPicture(title: title, kept: (.plates, "\(airport)|\(url)")) {
            let pages = try await KeptForAir.answer(.plates, key: "\(airport)|\(url)") { try await Planner.faaChart(url: url, airport: airport) }.value
            guard !pages.isEmpty else { throw Planner.Failure(status: 404, detail: "The FAA's chart has no page for \(airport).") }
            return try await PictureCache.images(pages.map(\.path))
        }
        shown.request = PictureRequest(title: title, source: .faaChart(url: url, airport: airport))
        return shown
    }

    /// The picture a window was opened on (PictureWindow).
    init(_ request: PictureRequest) {
        switch request.source {
        case .paths(let paths): self = .paths(request.title, paths, credit: request.credit, creditLink: request.creditLink)
        case .faaChart(let url, let airport): self = .faaChart(request.title, url: url, airport: airport)
        }
        // Observers do not run in a type's own initialiser: both set.
        georeference = request.georeference
        self.request?.georeference = request.georeference
    }

    init(title: String, credit: String? = nil, kept: (kind: KeptForAir.Kind, key: String)? = nil, load: @escaping () async throws -> [UIImage]) {
        self.title = title
        self.credit = credit
        self.kept = kept
        self.load = load
    }
}

/// A picture by what it is rather than how it loads, so the system can
/// open it in a window of its own and bring that window back after a
/// relaunch (`openWindow(value:)`, the scene's value kept as Codable): a
/// plate beside the map on the iPad, the HIG's auxiliary window,
/// "dedicated to one experience" (HIG Windows). The owner, 2026-11-21:
/// "Yes do it all for iPad", the plate's second window among it.
struct PictureRequest: Codable, Hashable, Sendable {
    enum Source: Codable, Hashable, Sendable {
        /// The planner's pictures by their paths.
        case paths([String])
        /// One of the FAA's charts by its address, for the field.
        case faaChart(url: String, airport: String)
    }

    let title: String
    var credit: String?
    /// The credit's page, as ShownPicture's.
    var creditLink: URL?
    let source: Source
    var georeference: APIPlateGeoreference?

    /// The picture windows' scene (WingtipApp).
    static let window = "picture"

    /// What the pilot's markup on the picture is kept by (PlateMarkup):
    /// its address, which names the cycle, so the next cycle's plate, which
    /// may be amended, starts clean rather than under notes made on the old.
    var markupKey: String {
        switch source {
        case .paths(let paths): paths.joined(separator: "|")
        case .faaChart(let url, let airport): "\(airport)|\(url)"
        }
    }
}
