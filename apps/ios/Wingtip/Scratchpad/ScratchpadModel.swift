import Foundation
import Observation

/// The scratchpad's model: the flight's pages, the one in sight, and each
/// change kept on this device as it is made (ScratchStore). The flight is
/// its route's idents (ReadyToFly.flightKey); with no route, the pad's own
/// pages, which stay where they are when a route is made.
@MainActor
@Observable
final class ScratchpadModel {
    /// The pages with no route: the pad's own.
    static let unrouted = "scratchpad"

    private(set) var flight = ScratchpadModel.unrouted
    private(set) var pages: [ScratchPage] = []
    /// The page in sight, by its id; the newest where none is picked.
    var shown: UUID?

    /// The flight's pages read, for the route now.
    func open(flight key: String) {
        let next = key.isEmpty ? Self.unrouted : key
        guard next != flight || pages.isEmpty else { return }
        flight = next
        pages = ScratchStore.load(next)
        shown = pages.last?.id
    }

    var page: ScratchPage? { pages.first { $0.id == shown } ?? pages.last }

    /// A new page of the kind, put in sight.
    func add(_ template: ScratchTemplate) {
        let page = ScratchPage(template: template)
        pages.append(page)
        shown = page.id
        keep()
    }

    /// The page in sight gone, the one before it shown.
    func deleteShown() {
        guard let page, let i = pages.firstIndex(of: page) else { return }
        pages.remove(at: i)
        shown = pages.isEmpty ? nil : pages[max(0, i - 1)].id
        keep()
    }

    func setField(_ key: String, _ text: String) {
        change { $0.fields[key] = text.isEmpty ? nil : text }
    }

    func setDrawing(_ data: Data) {
        change { $0.drawing = data }
    }

    /// A page's name in the pages' menu: its number and its kind.
    func name(_ page: ScratchPage) -> String {
        let number = (pages.firstIndex(of: page) ?? 0) + 1
        return "\(number) · \(page.template.title)"
    }

    private func change(_ edit: (inout ScratchPage) -> Void) {
        guard let id = page?.id, let i = pages.firstIndex(where: { $0.id == id }) else { return }
        var next = pages[i]
        edit(&next)
        guard next != pages[i] else { return }
        pages[i] = next
        keep()
    }

    private func keep() { ScratchStore.save(pages, flight) }
}
