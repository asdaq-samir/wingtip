package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** What the proxy lets a browser, a phone and CloudFront keep, and the
 *  headers a download needs: an upstream's Cache-Control kept only where
 *  the answer is the same for every pilot, a pack's file name and ranges
 *  (PlannerProxyTestBase's fake planner). */
class PlannerProxyCachingTest extends PlannerProxyTestBase {

    @Test
    void aChartTileKeepsItsUpstreamCacheControl() throws Exception {
        responseHeaders.put("Cache-Control", "public, max-age=604800");

        // The URL the map actually asks for (apps/web/src/lib/map/sources/tiles.ts),
        // which upstream is /api/chart-tile/... -- the rule is written
        // against the upstream path, not the browser's.
        MvcResult started = mockMvc.perform(get("/api/planner/chart-tile/sectional/10/262/380.png"))
                .andExpect(request().asyncStarted())
                .andReturn();

        // What lets a browser skip asking again for a tile it already
        // has, rather than round-tripping on every pan and zoom.
        mockMvc.perform(asyncDispatch(started)).andExpect(header().string("Cache-Control", "public, max-age=604800"));
    }

    @Test
    void thePhonesPacksAreForwardedWithTheirUpstreamCacheControl() throws Exception {
        assertThat(forwarded("GET", "/api/cycle-packs")).isTrue();
        assertThat(forwarded("GET", "/api/cycle-pack/2026-10-29/n40w092.pack")).isTrue();
        assertThat(forwarded("GET", "/api/cycle-pack/2026-10-29")).isFalse();
        responseHeaders.put("Cache-Control", "public, max-age=2419200, immutable");

        // A region's pack, its cycle in its address: kept the whole cycle
        // by the phone and by CloudFront, as an airport diagram is.
        MvcResult started = mockMvc.perform(get("/api/planner/cycle-pack/2026-10-29/n40w092.pack"))
                .andExpect(request().asyncStarted())
                .andReturn();
        mockMvc.perform(asyncDispatch(started))
                .andExpect(header().string("Cache-Control", "public, max-age=2419200, immutable"));
    }

    @Test
    void theAnswersTheSameForEveryPilotKeepTheirUpstreamCacheControl() throws Exception {
        responseHeaders.put("Cache-Control", "public, max-age=300, s-maxage=3600");

        // The chart, the airport search and the stock aircraft: what the
        // browser and CloudFront may keep (the planner's app.router_basics says
        // for how long), so a pilot typing an ident is answered from the
        // nearest edge.
        for (String path : new String[] {
            "/api/planner/chart", "/api/planner/airports/search?q=KD", "/api/planner/aircraft-profiles"
        }) {
            MvcResult started = mockMvc.perform(get(path))
                    .andExpect(request().asyncStarted())
                    .andReturn();
            mockMvc.perform(asyncDispatch(started))
                    .andExpect(header().string("Cache-Control", "public, max-age=300, s-maxage=3600"));
        }

        // The fields in view carry each one's METAR: whatever the planner
        // said, not passed on.
        MvcResult inView = mockMvc.perform(get("/api/planner/airports/in-view?south=46&west=-93&north=47&east=-92"))
                .andExpect(request().asyncStarted())
                .andReturn();
        mockMvc.perform(asyncDispatch(inView)).andExpect(header().doesNotExist("Cache-Control"));
    }

    @Test
    void theAirportIndexKeepsItsGzipEncodingAndCacheControlAndTheSearchDoesNotGetTheEncoding() throws Exception {
        responseHeaders.put("Content-Encoding", "gzip");
        responseHeaders.put("Vary", "Accept-Encoding");
        responseHeaders.put("Cache-Control", "public, max-age=86400");

        // The phone's own copy of the airport search: sent gzipped by the
        // planner, so the browser has to be told so, or it reads the bytes
        // as they are.
        MvcResult index = mockMvc.perform(get("/api/planner/airports/index"))
                .andExpect(request().asyncStarted())
                .andReturn();
        mockMvc.perform(asyncDispatch(index))
                .andExpect(header().string("Content-Encoding", "gzip"))
                .andExpect(header().string("Vary", "Accept-Encoding"))
                .andExpect(header().string("Cache-Control", "public, max-age=86400"));

        // Any other path's encoding is not passed on: its body is not the
        // planner's bytes as they came.
        MvcResult search = mockMvc.perform(get("/api/planner/airports/search?q=KD"))
                .andExpect(request().asyncStarted())
                .andReturn();
        mockMvc.perform(asyncDispatch(search)).andExpect(header().doesNotExist("Content-Encoding"));
    }

    @Test
    void theForeFlightPackKeepsItsFileNameSizeAndRangeAndNoOtherPathDoes() throws Exception {
        responseHeaders.put("Content-Disposition", "attachment; filename=\"C81-KDLH-checkpoints.zip\"");
        responseHeaders.put("Content-Range", "bytes 0-1/2");
        responseHeaders.put("Accept-Ranges", "bytes");
        MvcResult pack = mockMvc.perform(get("/api/planner/foreflight-pack/C81-KDLH/C81-KDLH-checkpoints.zip")
                        .header("Range", "bytes=0-1"))
                .andExpect(request().asyncStarted())
                .andReturn();
        // What a download, and ForeFlight's list of packs, call the file,
        // and what its downloader needs to fetch it in pieces: the range
        // asked for went to the planner, and its size and range came back.
        mockMvc.perform(asyncDispatch(pack))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"C81-KDLH-checkpoints.zip\""))
                .andExpect(header().string("Content-Length", "2"))
                .andExpect(header().string("Content-Range", "bytes 0-1/2"))
                .andExpect(header().string("Accept-Ranges", "bytes"));
        assertThat(received).contains("range=bytes=0-1");

        MvcResult course = mockMvc.perform(get("/api/planner/course?dep=C81&dest=KDLH"))
                .andExpect(request().asyncStarted())
                .andReturn();
        mockMvc.perform(asyncDispatch(course)).andExpect(header().doesNotExist("Content-Disposition"));
    }

    @Test
    void theOverlayTilesArchiveIsReadInRangesAndKeptForItsCycle() throws Exception {
        assertThat(forwarded("GET", "/api/overlay-tiles")).isTrue();
        assertThat(forwarded("GET", "/api/overlay-tiles/2026-10-29-v1-0badf00d.pmtiles"))
                .isTrue();
        assertThat(forwarded("GET", "/api/overlay-tiles/a/b.pmtiles")).isFalse();
        responseStatus = 206;
        responseHeaders.put("Cache-Control", "public, max-age=2419200, immutable");
        responseHeaders.put("Content-Range", "bytes 0-1/2");
        responseHeaders.put("Accept-Ranges", "bytes");
        responseHeaders.put("ETag", "\"abc\"");
        MvcResult started = mockMvc.perform(get("/api/planner/overlay-tiles/2026-10-29-v1-0badf00d.pmtiles")
                        .header("Range", "bytes=0-1"))
                .andExpect(request().asyncStarted())
                .andReturn();
        // The map's PMTiles reader asks a range at a time: the range went
        // to the planner, and the part, its range and its ETag came back,
        // kept by the browser and CloudFront as an airport diagram is.
        mockMvc.perform(asyncDispatch(started))
                .andExpect(status().is(206))
                .andExpect(header().string("Content-Length", "2"))
                .andExpect(header().string("Content-Range", "bytes 0-1/2"))
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andExpect(header().string("ETag", "\"abc\""))
                .andExpect(header().string("Cache-Control", "public, max-age=2419200, immutable"));
        assertThat(received).contains("range=bytes=0-1");
    }

    @Test
    void theRetiredPerKindTilePathsAreNotForwarded() throws Exception {
        // /api/sectional-tile and /api/tac-tile were the same tiles under
        // older names, with no caller left; the planner no longer has them.
        for (String kind : new String[] {"sectional-tile", "tac-tile"}) {
            mockMvc.perform(get("/api/planner/" + kind + "/10/262/380.png")).andExpect(status().isNotFound());
        }
    }

    @Test
    void everyOtherPathDropsAnUpstreamCacheControl() throws Exception {
        responseHeaders.put("Cache-Control", "public, max-age=604800");

        MvcResult started = mockMvc.perform(get("/api/planner/course?dep=C81&dest=KDLH"))
                .andExpect(request().asyncStarted())
                .andReturn();

        // A course depends on saved state and on who is asking; caching
        // it the way a tile is cached would serve one pilot another's.
        mockMvc.perform(asyncDispatch(started)).andExpect(header().doesNotExist("Cache-Control"));
    }
}
