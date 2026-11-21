import SwiftUI
import UniformTypeIdentifiers

/// The route shared, as the web's nav log Share (the owner, 2026-11-21:
/// "Print navlog should be in navlog share, not in more. Same with the
/// checkpoints"): its link, the nav log as text and as the kneeboard's
/// page (PDF), the checkpoints for ForeFlight (its content pack), Save as
/// File -- the flight as a Wingtip flight file (FlightFile), which opens on
/// another iPhone as the shared link's preview, and the kneeboard as a
/// PDF, each saved through the system's file exporter (SaveFileExporter,
/// SaveFileLink) -- and Print, the system's print panel over the
/// kneeboard's page. Every share is the system's ShareLink, a file made
/// only when the share sheet asks for it (SharedFile). FPL's ••• is
/// RouteMoreMenu: Route Options, the link and Open in ForeFlight.
struct ShareMenu: View {
    @Environment(Plan.self) private var plan
    @Environment(\.openURL) private var openURL
    @State private var includeTail = false
    /// The file being saved, while the exporter is up.
    @State private var saving: SavedFile?

    var body: some View {
        Menu {
            ways
        } label: {
            Image(systemName: WingtipIcon.share)
        }
        .accessibilityLabel("Share")
        .disabled(plan.legs.isEmpty)
        .modifier(SaveFileExporter(saving: $saving))
    }

    /// The ways the route goes out.
    @ViewBuilder private var ways: some View {
        ShareLink(item: RouteShare.link(plan, includeTail: includeTail)) { Label("Share Link", systemImage: "link") }
        if let tail = plan.tail { Toggle("Include \(tail)", isOn: $includeTail) }
        ShareLink(item: RouteShare.navLogText(plan)) { Label("Nav Log as Text", systemImage: WingtipIcon.navLog) }
        ShareLink(item: navLogPDF, preview: SharePreview("Nav Log")) { Label("Nav Log as PDF", systemImage: "doc.richtext") }
        // The checkpoints as ForeFlight's content pack, named as the nav
        // log names them, so a route sent after finds them by name.
        if !plan.checkpoints.isEmpty {
            Button { RouteShare.sendPack(plan, openURL: openURL) } label: {
                Label("Checkpoints for ForeFlight", systemImage: "mappin.and.ellipse")
            }
        }
        Menu {
            SaveFileLink(saving: $saving, make: flightFile) {
                Label("Flight", systemImage: "airplane")
            }
            SaveFileLink(saving: $saving, make: kneeboardFile) {
                Label("Kneeboard as PDF", systemImage: "doc.richtext")
            }
        } label: {
            Label("Save as File", systemImage: "square.and.arrow.down")
        }
        Button { print() } label: { Label("Print Nav Log", systemImage: "printer") }
    }

    /// The kneeboard's page in the system's print panel (UIKit's
    /// UIPrintInteractionController, the stock way an iPhone prints).
    private func print() {
        _ = try? Self.said("The nav log's print", on: plan) {
            guard let url = Kneeboard.pdf(plan), UIPrintInteractionController.canPrint(url) else { throw CocoaError(.fileReadUnknown) }
            let printer = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = "Nav Log \(plan.idents.joined(separator: " "))"
            info.outputType = .general
            printer.printInfo = info
            printer.printingItem = url
            printer.present(animated: true)
        }
    }

    /// The flight as a Wingtip flight file, the N-number in it only where
    /// Include is on, as for Share Link; made when it is saved.
    private var flightFile: @MainActor @Sendable () throws -> SavedFile? {
        { [plan, includeTail] in
            try Self.said("The flight file", on: plan) {
                SavedFile(data: try FlightFile.of(plan, includeTail: includeTail).data(), type: .wingtipFlight, name: FlightFile.name(plan))
            }
        }
    }

    /// The kneeboard's page as a PDF file (Kneeboard.pdf); made when it is saved.
    private var kneeboardFile: @MainActor @Sendable () throws -> SavedFile? {
        { [plan] in
            try Self.said("The kneeboard's PDF", on: plan) {
                guard let url = Kneeboard.pdf(plan) else { throw CocoaError(.fileWriteUnknown) }
                return SavedFile(data: try Data(contentsOf: url), type: .pdf, name: url.lastPathComponent)
            }
        }
    }

    /// The nav log's page as a PDF, drawn when the share sheet asks for it.
    private var navLogPDF: SharedFile {
        SharedFile(name: nil, type: .pdf) { [plan] in
            try Self.said("The nav log's PDF", on: plan) {
                guard let url = Kneeboard.pdf(plan) else { throw CocoaError(.fileWriteUnknown) }
                return url
            }
        }
    }

    /// A file made for the share sheet or the exporter, and why it could
    /// not be, said under the route (Plan.shareProblem, lib/problems' rule:
    /// where it happens), since the sheet itself then just sends nothing.
    /// Thrown on, so nothing half made goes.
    @MainActor
    private static func said<T>(_ what: String, on plan: Plan, _ make: () throws -> T) throws -> T {
        do {
            let made = try make()
            plan.shareProblem = nil
            return made
        } catch {
            plan.shareProblem = "\(what) couldn't be made, so nothing was sent: \(error.localizedDescription)"
            throw error
        }
    }
}
