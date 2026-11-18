package app.wingtipmaps.gateway.security;

/**
 * The page's Content-Security-Policy (SecurityConfig's headers), and the
 * hosts beyond this origin it lets the browser reach, each listed host by
 * host: the policy allows no wildcard (SecurityRulesTest).
 *
 * <p>Everything the app loads is same-origin, the chart included: its
 * tiles are the FAA's charts, rendered by this app from the FAA's GeoTIFFs
 * and proxied from the planner. The map's overlay is the one place the
 * browser asks others directly: the USGS's imagery tiles and Google's Map
 * Tiles API, whose terms have the browser draw its tiles and ask for its
 * session and viewport itself, and Google's works only with a key the
 * deployment sets, so both are allowed always. MapLibre fetches a raster
 * tile to read its caching headers, so img-src and connect-src list the
 * same tile hosts. style-src keeps 'unsafe-inline' for Swagger UI's own
 * inline styles.
 */
final class ContentSecurityPolicy {

    /** The weather loop's tiles (web features/weather-loop): IEM's NEXRAD and nowCOAST's GOES. */
    private static final String WEATHER_TILES = "https://mesonet.agron.iastate.edu https://nowcoast.noaa.gov";

    private static final String OVERLAY_TILES =
            "https://basemap.nationalmap.gov https://tile.googleapis.com " + WEATHER_TILES;

    /** An airplane's photo (planePhoto.ts): Planespotters' API and image server, per its terms. */
    private static final String PHOTO_IMAGES = "https://t.plnspttrs.net";

    private static final String PHOTO_CONNECT = "https://api.planespotters.net";

    /**
     * Where the browser may fetch Studio's on-device speech model from: transformers.js downloads the
     * Whisper weights (onnx-community/whisper-base, Apache-2.0) from Hugging Face, which redirects each
     * file to its AWS CDN in the US or the EU.
     */
    static final String MODEL_HOSTS = "https://huggingface.co https://us.aws.cdn.hf.co https://eu.aws.cdn.hf.co";

    private ContentSecurityPolicy() {}

    /**
     * The policy's directives, the chart tiles' CDN (application.yml's
     * app.chart-tiles-origin, blank locally, where the tiles are
     * same-origin) allowed as images.
     */
    static String directives(String chartTilesOrigin) {
        String chartTiles = chartTilesOrigin.isBlank() ? "" : " " + chartTilesOrigin.trim();
        return "default-src 'self'; "
                + "img-src 'self' data:" + chartTiles + " " + OVERLAY_TILES + " " + PHOTO_IMAGES + "; "
                + "style-src 'self' 'unsafe-inline'; "
                // 'wasm-unsafe-eval': WebAssembly compiled from this origin's own
                // files, the page reader's engine (web features/airplane/lib/readPage);
                // no script eval.
                + "script-src 'self' 'wasm-unsafe-eval'; "
                + "connect-src 'self' " + OVERLAY_TILES + " " + PHOTO_CONNECT + " " + MODEL_HOSTS + "; "
                + "object-src 'none'; "
                + "base-uri 'self'; "
                + "frame-ancestors 'none'";
    }
}
