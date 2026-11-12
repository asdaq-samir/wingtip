package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.PaperworkDto;
import app.wingtipmaps.gateway.service.PaperworkService;
import java.time.LocalDate;
import org.springframework.http.ResponseEntity;
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

    public PaperworkController(PaperworkService paperwork) {
        this.paperwork = paperwork;
    }

    @GetMapping
    public ResponseEntity<PaperworkDto> due(Pilot pilot) {
        LocalDate today = LocalDate.now();
        return ResponseEntity.ok(PaperworkService.toDto(paperwork.of(pilot, today), today));
    }
}
