package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.dto.PaperworkDto;
import app.wingtipmaps.gateway.service.PaperworkService;
import app.wingtipmaps.gateway.service.PilotService;
import java.time.LocalDate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What falls due for the pilot and their airplanes, soonest first, each
 * with its rule and the days or hours left (PaperworkService): the "Coming
 * up" list each app shows, the same list the reminder emails are made
 * from. Pilot-scoped: 401 signed out.
 */
@RestController
@RequestMapping("/api/paperwork")
public class PaperworkController {

    private final PaperworkService paperwork;
    private final PilotService pilots;

    public PaperworkController(PaperworkService paperwork, PilotService pilots) {
        this.paperwork = paperwork;
        this.pilots = pilots;
    }

    @GetMapping
    public ResponseEntity<PaperworkDto> due(Authentication authentication) {
        LocalDate today = LocalDate.now();
        return PilotResponses.withPilot(
                pilots,
                authentication,
                pilot -> ResponseEntity.ok(PaperworkService.toDto(paperwork.of(pilot, today), today)));
    }
}
