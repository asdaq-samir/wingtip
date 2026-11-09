package app.wingtipmaps.gateway.contract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * What a stub answers: a sample of an operation's answer in the same
 * document, with every field filled. The types a client reads it into
 * are generated from the document, so reading it is the check.
 */
public final class AnswerContract {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private final OpenApiContract document;

    public AnswerContract(OpenApiContract document) {
        this.document = document;
    }

    /** A value of the schema with every field it may have, for a stub to
     *  answer with: the client's own reading of it is then exercised. */
    public JsonNode sample(JsonNode schema) {
        return sample(schema, 0);
    }

    private JsonNode sample(JsonNode schema, int depth) {
        schema = document.resolve(schema);
        if (depth > 12) {
            return NODES.nullNode();
        }
        if (schema.has("anyOf")) {
            for (JsonNode branch : schema.get("anyOf")) {
                if (!"null".equals(document.resolve(branch).path("type").asText())) {
                    return sample(branch, depth);
                }
            }
            return NODES.nullNode();
        }
        return switch (schema.path("type").asText("")) {
            case "object" -> {
                ObjectNode out = NODES.objectNode();
                schema.path("properties")
                        .fields()
                        .forEachRemaining(f -> out.set(f.getKey(), sample(f.getValue(), depth + 1)));
                if (schema.path("additionalProperties").isObject()) {
                    out.set("key", sample(schema.get("additionalProperties"), depth + 1));
                }
                yield out;
            }
            case "array" -> {
                ArrayNode out = NODES.arrayNode();
                out.add(sample(schema.path("items"), depth + 1));
                yield out;
            }
            case "string" ->
                schema.has("enum")
                        ? schema.get("enum").get(0)
                        : NODES.textNode(
                                switch (schema.path("format").asText("")) {
                                    case "date" -> "2026-11-09";
                                    case "date-time" -> "2026-11-09T12:00:00Z";
                                    default -> "x";
                                });
            case "number" -> NODES.numberNode(1.5);
            case "integer" -> NODES.numberNode(1);
            case "boolean" -> NODES.booleanNode(true);
            default -> NODES.objectNode();
        };
    }
}
