import UIKit

/// The pages of a picture full screen, one under another, zoomed and
/// panned as Photos' are, with own ship on the first and the pilot's
/// marks over them (ZoomablePictures' view).
final class PagesScrollView: UIScrollView, UIScrollViewDelegate {
    private let container = UIView()
    private var laidWidth: CGFloat = 0
    /// The airplane on the first page, inside the zoomed content so it
    /// stays on its point through a pinch, a drag and a double tap, and
    /// scaled back each zoom so it keeps its size, as the map's mark does.
    private let ownShip = PageOwnShipView()
    /// The pilot's marks over the pages, zoomed with them (MarkupLayer).
    let markup = MarkupLayer()
    /// The Clear Markups done (MarkupState.clears).
    var cleared = 0
    static let gap: CGFloat = 8

    var images: [UIImage] = [] {
        didSet {
            container.subviews.forEach { $0.removeFromSuperview() }
            whiteOnBlack = nil
            inverting?.cancel()
            inverting = nil
            for image in images {
                let page = UIImageView(image: image)
                page.contentMode = .scaleAspectFit
                page.addSubview(PageLook.shadeView(over: page))
                container.addSubview(page)
            }
            container.addSubview(markup)
            laidWidth = 0
            paint()
            setNeedsLayout()
        }
    }

    /// The pages turned white on black, drawn once off the main thread
    /// (PageLook.inverted) and kept while White on Black is on; nil until
    /// then, and let go as it is turned off, so the pages are held twice
    /// only while the inverted ones are shown (the originals are the
    /// viewer's, held by its caller whatever this keeps).
    private var whiteOnBlack: [UIImage]?
    private var inverting: Task<Void, Never>?

    /// The pages' night look: the Dimmer only moves each shade's alpha;
    /// White on Black swaps in the inverted pages, drawn once.
    var look = PageLook() {
        didSet { if look != oldValue { paint() } }
    }

    private func paint() {
        let pages = container.subviews.compactMap { $0 as? UIImageView }
        if !look.inverted {
            whiteOnBlack = nil
            inverting?.cancel()
            inverting = nil
        }
        if look.inverted, whiteOnBlack == nil, inverting == nil {
            let originals = images
            inverting = Task { [weak self] in
                let turned = await PageLook.inverted(originals)
                guard let self, !Task.isCancelled, self.images.elementsEqual(originals, by: ===) else { return }
                self.whiteOnBlack = turned
                self.inverting = nil
                self.paint()
            }
        }
        for (k, page) in pages.enumerated() where k < images.count {
            // Until the inverted page comes, none: the black paper, never
            // a white page flashed in a dark cockpit.
            page.image = look.inverted ? whiteOnBlack?[k] : images[k]
            page.backgroundColor = look.paper
            page.subviews.first?.alpha = look.shade
        }
        markup.brightness = 1 - look.shade
    }

    var mark: PageMark? {
        didSet { placeOwnShip() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        delegate = self
        minimumZoomScale = 1
        maximumZoomScale = 8
        bouncesZoom = true
        showsHorizontalScrollIndicator = false
        backgroundColor = .systemBackground
        addSubview(container)
        let twice = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
        twice.numberOfTapsRequired = 2
        addGestureRecognizer(twice)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// The pages the view's width, one under another, laid again when
    /// the width changes (a turn of the phone).
    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        if width > 0, width != laidWidth {
            laidWidth = width
            if zoomScale != 1 { zoomScale = 1 }
            var y: CGFloat = 0
            for (page, image) in zip(container.subviews.compactMap { $0 as? UIImageView }, images) {
                let size = image.size
                let height = size.width > 0 ? width * size.height / size.width : 0
                page.frame = CGRect(x: 0, y: y, width: width, height: height)
                y += height + Self.gap
            }
            container.frame = CGRect(x: 0, y: 0, width: width, height: max(0, y - Self.gap))
            contentSize = container.frame.size
            markup.place(width: width, height: container.frame.height)
            placeOwnShip()
        }
        centre()
    }

    /// The airplane at its fractions of the first page, turned to the
    /// track on the page; off the page, none.
    private func placeOwnShip() {
        guard let mark, let page = container.subviews.first(where: { $0 is UIImageView }) else {
            ownShip.removeFromSuperview()
            return
        }
        if ownShip.superview !== container { container.addSubview(ownShip) }
        container.bringSubviewToFront(ownShip)
        ownShip.center = CGPoint(x: page.frame.minX + page.frame.width * mark.x, y: page.frame.minY + page.frame.height * mark.y)
        ownShip.show(mark, zoom: zoomScale)
    }

    /// A page shorter than the screen sits in its middle, as Photos'.
    private func centre() {
        let spare = max(0, (bounds.height - safeAreaInsets.top - safeAreaInsets.bottom - contentSize.height) / 2)
        if contentInset.top != spare { contentInset = UIEdgeInsets(top: spare, left: 0, bottom: spare, right: 0) }
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { container }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        centre()
        if let mark { ownShip.show(mark, zoom: zoomScale) }
    }

    @objc private func doubleTapped(_ tap: UITapGestureRecognizer) {
        // The zoom steps rather than glides with Reduce Motion on (MapMotion).
        if zoomScale > 1.01 {
            setZoomScale(1, animated: MapMotion.animated)
        } else {
            let at = tap.location(in: container)
            let size = CGSize(width: bounds.width / 3, height: bounds.height / 3)
            zoom(to: CGRect(x: at.x - size.width / 2, y: at.y - size.height / 2, width: size.width, height: size.height), animated: MapMotion.animated)
        }
    }
}
