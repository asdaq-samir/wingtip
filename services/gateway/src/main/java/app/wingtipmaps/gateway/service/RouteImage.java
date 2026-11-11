package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.dto.FlightCheckpointDto;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import javax.imageio.ImageIO;

/**
 * A shared flight's route as a picture, for its link's preview card
 * (Open Graph's og:image): the nav log's points joined in order on the
 * sectional's lowland green, the route in the mark's magenta and its
 * points in its navy -- design/tokens.json's color.brand chart-land,
 * mark-ring and mark-plane. Lines and dots alone, no text, so it draws
 * the same on a server with no fonts.
 *
 * <p>A picture of the plan, not a chart: positions are placed by a plain
 * equirectangular projection, longitude scaled by the cosine of the
 * route's middle latitude, which is close enough to look like the route
 * at a glance and is never read as navigation.
 */
public final class RouteImage {

    /** The size Open Graph previews are drawn at (1.91:1). */
    static final int WIDTH = 1200;

    static final int HEIGHT = 630;

    private static final int MARGIN = 90;

    private static final Color GROUND = new Color(0xd7e8c6);
    private static final Color ROUTE = new Color(0xa3266f);
    private static final Color POINT = new Color(0x14284b);

    private RouteImage() {}

    /** The route drawn as a PNG; the ground alone for fewer than two points. */
    public static byte[] png(List<FlightCheckpointDto> points) {
        BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setColor(GROUND);
            g.fillRect(0, 0, WIDTH, HEIGHT);
            if (points.size() >= 2) {
                draw(g, points);
            }
        } finally {
            g.dispose();
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException("A route's picture would not write as PNG", e);
        }
        return out.toByteArray();
    }

    private static void draw(Graphics2D g, List<FlightCheckpointDto> points) {
        double minLat =
                points.stream().mapToDouble(FlightCheckpointDto::lat).min().orElse(0);
        double maxLat =
                points.stream().mapToDouble(FlightCheckpointDto::lat).max().orElse(0);
        double minLon =
                points.stream().mapToDouble(FlightCheckpointDto::lon).min().orElse(0);
        double maxLon =
                points.stream().mapToDouble(FlightCheckpointDto::lon).max().orElse(0);
        double squeeze = Math.cos(Math.toRadians((minLat + maxLat) / 2));
        double spanX = Math.max((maxLon - minLon) * squeeze, 1e-6);
        double spanY = Math.max(maxLat - minLat, 1e-6);
        double scale = Math.min((WIDTH - 2.0 * MARGIN) / spanX, (HEIGHT - 2.0 * MARGIN) / spanY);
        // Centred, north up.
        double offsetX = (WIDTH - spanX * scale) / 2;
        double offsetY = (HEIGHT - spanY * scale) / 2;
        Path2D.Double line = new Path2D.Double();
        double[][] at = new double[points.size()][];
        for (int i = 0; i < points.size(); i++) {
            FlightCheckpointDto p = points.get(i);
            double x = offsetX + (p.lon() - minLon) * squeeze * scale;
            double y = HEIGHT - offsetY - (p.lat() - minLat) * scale;
            at[i] = new double[] {x, y};
            if (i == 0) {
                line.moveTo(x, y);
            } else {
                line.lineTo(x, y);
            }
        }
        g.setColor(ROUTE);
        g.setStroke(new BasicStroke(10f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(line);
        g.setColor(POINT);
        for (int i = 0; i < at.length; i++) {
            // The ends larger than the points between.
            double r = i == 0 || i == at.length - 1 ? 16 : 8;
            g.fill(new Ellipse2D.Double(at[i][0] - r, at[i][1] - r, 2 * r, 2 * r));
        }
    }
}
