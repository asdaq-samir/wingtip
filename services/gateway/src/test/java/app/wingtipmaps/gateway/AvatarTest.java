package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The pilot's own photo for their avatar (AvatarController), against a
 * real Postgres: set, given by GET /api/me as a versioned address, read
 * back as the image it is, private and kept by the browser, replaced,
 * and taken out; only a JPEG, PNG or WebP of at most 512 KB is kept, and
 * nobody signed out sets one or reads another's.
 */
class AvatarTest extends AccountTestBase {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10};

    private Pilot pilot() {
        return pilots.save(new Pilot(UUID.randomUUID() + "@example.com", "Test Pilot", null, null));
    }

    private static RequestPostProcessor as(Pilot pilot) {
        return authentication(new MagicLinkAuthenticationToken(pilot.getEmail()));
    }

    private static MockMultipartHttpServletRequestBuilder upload(String type, byte[] bytes) {
        return multipart(HttpMethod.PUT, "/api/me/avatar")
                .file(new MockMultipartFile("photo", "photo", type, bytes))
                .with(csrf());
    }

    private String avatarUrl(Pilot pilot) throws Exception {
        String me = mockMvc.perform(get("/api/me").with(as(pilot)))
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(me, "$.avatarUrl");
    }

    @Test
    void aPhotoIsSetReadBackAndTakenOut() throws Exception {
        Pilot pilot = pilot();
        mockMvc.perform(get("/api/me").with(as(pilot)))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()));

        mockMvc.perform(upload("image/png", PNG).with(as(pilot))).andExpect(status().isNoContent());
        String first = avatarUrl(pilot);
        mockMvc.perform(get(first).with(as(pilot)))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"))
                .andExpect(content().bytes(PNG))
                .andExpect(header().string("Cache-Control", containsString("private")));

        // Another photo, at another address: a cached first one is never shown for it.
        Thread.sleep(5);
        mockMvc.perform(upload("image/jpeg", JPEG).with(as(pilot))).andExpect(status().isNoContent());
        String second = avatarUrl(pilot);
        assertThat(second).startsWith("/api/me/avatar?v=").isNotEqualTo(first);
        mockMvc.perform(get(second).with(as(pilot))).andExpect(content().contentType("image/jpeg"));

        mockMvc.perform(delete("/api/me/avatar").with(csrf()).with(as(pilot))).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/me").with(as(pilot)))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()));
        mockMvc.perform(get("/api/me/avatar").with(as(pilot))).andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/me/avatar").with(csrf()).with(as(pilot))).andExpect(status().isNotFound());
    }

    @Test
    void onlyASmallJpegPngOrWebpIsKept() throws Exception {
        Pilot pilot = pilot();
        // Said to be a PNG, but a JPEG's bytes; a GIF; nothing; too large.
        mockMvc.perform(upload("image/png", JPEG).with(as(pilot)))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.detail").value(startsWith("A photo is a JPEG, PNG or WebP")));
        mockMvc.perform(upload("image/gif", "GIF89a".getBytes()).with(as(pilot)))
                .andExpect(status().isUnsupportedMediaType());
        mockMvc.perform(upload("image/jpeg", new byte[0]).with(as(pilot))).andExpect(status().isBadRequest());
        byte[] large = new byte[512 * 1024 + 1];
        System.arraycopy(JPEG, 0, large, 0, JPEG.length);
        mockMvc.perform(upload("image/jpeg", large).with(as(pilot))).andExpect(status().isContentTooLarge());
        mockMvc.perform(get("/api/me").with(as(pilot)))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()));
    }

    @Test
    void nobodySignedInSetsOrReadsOne() throws Exception {
        Pilot pilot = pilot();
        mockMvc.perform(upload("image/png", PNG).with(as(pilot))).andExpect(status().isNoContent());

        mockMvc.perform(upload("image/png", PNG)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/me/avatar")).andExpect(status().isUnauthorized());
        // Another pilot's address is their own: the photo is the session's pilot's.
        mockMvc.perform(get("/api/me/avatar").with(as(pilot()))).andExpect(status().isNotFound());
    }
}
