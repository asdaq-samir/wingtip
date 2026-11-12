package app.wingtipmaps.gateway.upstream;

import app.wingtipmaps.gateway.assistant.model.AssistantChangesWords;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.service.annotation.HttpExchange;
import org.springframework.web.service.annotation.PostExchange;

/**
 * What changed between two briefings, in words: the assistant service asks
 * the planner for the changes and Claude for the words. Its answer is the
 * assistant's ChangesWords, generated from services/assistant/openapi.json
 * (the pom); the ask carries both briefings as the JSON they came as.
 */
@HttpExchange
public interface AssistantApi {

    @PostExchange(url = "/api/words/changes", contentType = MediaType.APPLICATION_JSON_VALUE)
    AssistantChangesWords changes(@RequestBody String ask);
}
