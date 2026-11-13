package app.wingtipmaps.gateway.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** One thing that changed in a watched flight's briefing, in the
 *  planner's own line for it, and the ids of the reports it was read from
 *  ("metar:KDLH"), which {@link BriefingSourceDto} lists (ChangeLines). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record BriefingChangeDto(String text, List<String> sources) {}
