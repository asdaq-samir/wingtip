package app.wingtipmaps.gateway.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import app.wingtipmaps.gateway.service.Mailer;
import app.wingtipmaps.gateway.service.PilotService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Asking for sign-in links is throttled, with the real limits: nobody
 * can fill a stranger's inbox from the sign-in form, and the answer for
 * a throttled address says nothing about whether it has an account.
 */
@WebMvcTest(MagicLinkController.class)
@Import(Mailer.class)
@AutoConfigureMockMvc(addFilters = false)
class MagicLinkThrottleTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MagicLinkRepository magicLinks;

    @MockitoBean
    private PilotService pilots;

    @MockitoBean
    private JavaMailSender mailSender;

    private void ask(String email, String client, int expected) throws Exception {
        mockMvc.perform(post("/api/auth/magic-link")
                        .with(request -> {
                            request.setRemoteAddr(client);
                            return request;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().is(expected));
    }

    @Test
    void theSixthLinkInAnHourForOneAddressFromOneCallerIsRefused() throws Exception {
        for (int i = 0; i < 5; i++) {
            ask("target@example.com", "192.0.2.10", 202);
        }
        ask("TARGET@example.com", "192.0.2.10", 429);
        ask("someone-else@example.com", "192.0.2.10", 202);
    }

    /** The deep security review of 2026-11-21: the address's five were
     *  every caller's, so five asks from anywhere locked its pilot out of
     *  signing in for the hour. A stranger spends only their own five; the
     *  pilot asking from their own address still gets a link. */
    @Test
    void aStrangerAskingForAnAddressDoesNotLockItsPilotOut() throws Exception {
        for (int i = 0; i < 5; i++) {
            ask("pilot@example.com", "198.51.100.66", 202);
        }
        ask("pilot@example.com", "198.51.100.66", 429);
        ask("pilot@example.com", "192.0.2.44", 202);
    }

    /** And the address's inbox still takes ADDRESS_CALLERS callers' worth
     *  an hour in all, whoever asks. */
    @Test
    void anAddressTakesSoManyLinksAnHourInAll() throws Exception {
        int all = 5 * MagicLinkController.ADDRESS_CALLERS;
        for (int i = 0; i < all; i++) {
            ask("inbox@example.com", "203.0.113." + (i / 5), 202);
        }
        ask("inbox@example.com", "203.0.113.200", 429);
    }

    @Test
    void oneCallerCannotSprayAddresses() throws Exception {
        for (int i = 0; i < 20; i++) {
            ask("spray" + i + "@example.com", "192.0.2.7", 202);
        }
        ask("spray-last@example.com", "192.0.2.7", 429);
    }
}
