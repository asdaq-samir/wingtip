import SwiftUI

/// Views laid left to right and wrapped onto the next line where the
/// width runs out, each whole on its line, as words wrap: FPL's route box
/// (RouteBoxSection), whose points are pills in the order flown (the web's
/// RouteBox, its TokenField's wrapped face). SwiftUI has no stock flow
/// layout, so this is the Layout protocol's own small one. Each line is
/// as tall as its tallest view, the views centred on it, so the box is as
/// tall as its pills and no taller (the owner's canvas A, 2026-11-23).
struct FlowLayout: Layout {
    /// Between two views on a line: each small pill's 44-point area
    /// reaches half way across it, so the areas meet (CLAUDE.md, "Hit
    /// areas").
    var spacing: CGFloat = WingtipSpace.sm
    /// Between two lines.
    var lineSpacing: CGFloat = WingtipSpace.sm

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let lines = lines(width: width, subviews)
        let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(lines.count - 1, 0))
        let widest = lines.map(\.width).max() ?? 0
        return CGSize(width: width.isFinite ? width : widest, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for line in lines(width: bounds.width, subviews) {
            var x = bounds.minX
            for item in line.items {
                subviews[item.index].place(at: CGPoint(x: x, y: y + line.height / 2), anchor: .leading,
                                           proposal: ProposedViewSize(item.size))
                x += item.size.width + spacing
            }
            y += line.height + lineSpacing
        }
    }

    private struct Line {
        var items: [(index: Int, size: CGSize)] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    /// The views in lines no wider than `width`; a view wider than a whole
    /// line is given the line's width, on a line of its own.
    private func lines(width: CGFloat, _ subviews: Subviews) -> [Line] {
        var lines: [Line] = []
        var line = Line()
        for (index, subview) in subviews.enumerated() {
            var size = subview.sizeThatFits(.unspecified)
            size.width = min(size.width, width)
            if !line.items.isEmpty, line.width + spacing + size.width > width {
                lines.append(line)
                line = Line()
            }
            line.width = line.items.isEmpty ? size.width : line.width + spacing + size.width
            line.height = max(line.height, size.height)
            line.items.append((index, size))
        }
        if !line.items.isEmpty { lines.append(line) }
        return lines
    }
}
