import UIKit

/// Own ship on a plate's page: the map's airplane (PlaneMarkView), a blue
/// arrow in a white disc turned to the track while flying, a dot where it
/// is still or has no track.
final class PageOwnShipView: UIView {
    private let arrow = UIImageView()
    static let side: CGFloat = 28

    override init(frame: CGRect) {
        super.init(frame: CGRect(x: 0, y: 0, width: Self.side, height: Self.side))
        arrow.frame = bounds.insetBy(dx: 3, dy: 3)
        arrow.contentMode = .scaleAspectFit
        arrow.tintColor = WingtipColor.Chart.mapBlue
        backgroundColor = NightPalette.markFill
        layer.cornerRadius = Self.side / 2
        layer.borderWidth = 1
        layer.borderColor = WingtipColor.Chart.shade.withAlphaComponent(0.4).cgColor
        addSubview(arrow)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// Its glyph for the mark, kept its size at the page's zoom and
    /// turned to the track on the page.
    func show(_ mark: PageMark, zoom: CGFloat) {
        let turned = mark.moving && mark.rotationDeg != nil
        arrow.image = UIImage(systemName: turned ? "location.north.fill" : "circle.fill")
        let scale = zoom > 0 ? 1 / zoom : 1
        transform = CGAffineTransform(scaleX: scale, y: scale)
            .rotated(by: turned ? (mark.rotationDeg ?? 0) * .pi / 180 : 0)
    }
}
