import Foundation

/// Everything the gateway keeps of the pilot as one JSON file (GET
/// /api/me/export, format "wingtip-maps-export/1"): the account, the
/// airplanes and their squawks, the flights and tracks, the logbook,
/// currency, training and instructing. The pilot's to keep or take
/// elsewhere, as the privacy policy promises and the web's Export My Data
/// does.
enum DataExport {
    /// The export fetched with the pilot's session and written to a file
    /// in the temporary folder under the gateway's own name for it, to be
    /// shared from there; a refusal (401 signed out) in the gateway's words.
    /// A download, kept byte for byte with the name its Content-Disposition
    /// gives, neither of which the generated client hands back, so it is
    /// asked of the session itself.
    static func fetch() async throws -> URL {
        var request = URLRequest(url: Config.gateway.appending(path: "/api/me/export"))
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await Gateway.session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw GatewayRefusal(status: status, words: GatewayRefusal.words(in: data)) }
        let disposition = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")
        let url = FileManager.default.temporaryDirectory.appending(path: fileName(contentDisposition: disposition))
        try data.write(to: url, options: .atomic)
        return url
    }

    /// The file's name from `attachment; filename="wingtip-maps-2026-11-09.json"`,
    /// kept to a plain name (no folder in it); today's in the same form
    /// where the header has none.
    static func fileName(contentDisposition: String?, today: Date = Date()) -> String {
        if let header = contentDisposition, let range = header.range(of: "filename=") {
            let raw = header[range.upperBound...].split(separator: ";").first ?? ""
            let name = raw.trimmingCharacters(in: CharacterSet(charactersIn: "\" ")).replacingOccurrences(of: "/", with: "-")
                .replacingOccurrences(of: "\\", with: "-")
            if !name.isEmpty, name != ".", name != ".." { return name }
        }
        let day = Date.ISO8601FormatStyle(timeZone: .current).year().month().day().dateSeparator(.dash)
        return "wingtip-maps-\(today.formatted(day)).json"
    }
}
