import SwiftUI
import UniformTypeIdentifiers

/// A file handed to the system's document exporter: the new WritableDocument
/// (SwiftUI, iOS 27.0 SDK; FileDocument is deprecated there), written by
/// the SDK's own FileWrapperDocumentWriter, its snapshot the file's bytes
/// as made. Nothing is kept or edited after: the pilot picks where it goes.
final class ExportedFile: WritableDocument {
    let file: SavedFile

    init(_ file: SavedFile) { self.file = file }

    static var writableContentTypes: [UTType] { [.wingtipFlight, .pdf, .commaSeparatedText] }

    func writer(configuration: sending WriteConfiguration) -> sending FileWrapperDocumentWriter<Data> {
        FileWrapperDocumentWriter(configuration) { data, _ in FileWrapper(regularFileWithContents: data) }
    }

    @MainActor
    func snapshot(contentType: UTType) async throws -> sending Data { file.data }
}

/// Save as File: the system's file exporter (fileExporter with a
/// WritableDocument), where the pilot picks a folder in Files.
struct SaveFileExporter: ViewModifier {
    @Binding var saving: SavedFile?

    func body(content: Content) -> some View {
        content.fileExporter(
            isPresented: Binding(get: { saving != nil }, set: { if !$0 { saving = nil } }),
            document: saving.map(ExportedFile.init), contentType: saving?.type,
            defaultFilename: saving.map { ($0.name as NSString).deletingPathExtension },
            onCompletion: { _ in saving = nil }, onCancellation: { saving = nil })
    }
}

/// A Save as File row: a button that hands the file to the exporter
/// (SaveFileExporter).
struct SaveFileLink<Label: View>: View {
    @Binding var saving: SavedFile?
    let make: @MainActor @Sendable () throws -> SavedFile?
    @ViewBuilder let label: () -> Label

    var body: some View {
        Button { saving = try? make() } label: { label() }
    }
}

/// A file for the system's ShareLink, made when the share sheet asks for
/// it rather than each time the menu is drawn: the kneeboard's PDF, the
/// flight file, the account's export. Its types are the ones the app
/// sends; a file of another type is not offered.
struct SharedFile: Transferable {
    /// The name the file goes out under, with its extension; nil to keep
    /// the one `make` writes (the gateway's, for the account's export).
    let name: String?
    let type: UTType
    /// The file written, in the temporary folder.
    let make: @MainActor @Sendable () async throws -> URL

    static var transferRepresentation: some TransferRepresentation {
        file(.pdf)
        file(.wingtipFlight)
        file(.commaSeparatedText)
        file(.json)
    }

    private static func file(_ type: UTType) -> some TransferRepresentation<SharedFile> {
        FileRepresentation(exportedContentType: type) { SentTransferredFile(try await $0.make()) }
            .suggestedFileName { $0.name }
            .exportingCondition { $0.type == type }
    }
}

/// A link for the system's ShareLink made when the share sheet asks for
/// it (a saved flight's, by the gateway), sent as its text, which Messages,
/// Mail and Copy all take and show as the link.
struct SharedLink: Transferable {
    let make: @MainActor @Sendable () async throws -> URL

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .utf8PlainText) { Data(try await $0.make().absoluteString.utf8) }
    }
}
