package app.wingtipmaps.gateway.contract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

/**
 * One service's OpenAPI document, read as a contract a hand-written client
 * is held to on what it sends: does an operation exist, and does a body or
 * a query the client sends fit what the operation takes. What it reads
 * back is generated from the document; {@link AnswerContract} samples an
 * answer for a stub to send. Every problem is a sentence naming the
 * field, for the caller to prefix with the client method it came from.
 */
public final class OpenApiContract {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private final JsonNode document;

    public OpenApiContract(JsonNode document) {
        this.document = document;
    }

    /** The document built into the gateway's jar (pom.xml copies each
     *  service's openapi.json to upstreams/&lt;service&gt;/ as it builds). */
    public static JsonNode shipped(String service) {
        String resource = "upstreams/" + service + "/openapi.json";
        try (InputStream in = OpenApiContract.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException(resource + " is not on the classpath: pom.xml copies it as it builds");
            }
            return JSON.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(resource, e);
        }
    }

    /** The operation answering {@code method} on a concrete path, its path
     *  template's {param}s matching one segment each. */
    public Optional<JsonNode> operation(String method, String path) {
        for (Iterator<Map.Entry<String, JsonNode>> it = document.path("paths").fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> entry = it.next();
            String pattern = entry.getKey().replaceAll("\\{[^/}]+}", "[^/]+").replace(".", "\\.");
            if (path.matches(pattern) && entry.getValue().has(method.toLowerCase())) {
                return Optional.of(entry.getValue().get(method.toLowerCase()));
            }
        }
        return Optional.empty();
    }

    /** The schema of an operation's JSON request body, or of its 200 answer. */
    public static Optional<JsonNode> requestSchema(JsonNode operation) {
        return Optional.ofNullable(operation.at("/requestBody/content/application~1json/schema"))
                .filter(n -> !n.isMissingNode());
    }

    public static Optional<JsonNode> answerSchema(JsonNode operation) {
        return Optional.ofNullable(operation.at("/responses/200/content/application~1json/schema"))
                .filter(n -> !n.isMissingNode());
    }

    /** The query (or header) parameters an operation takes, by name. */
    public static Map<String, JsonNode> parameters(JsonNode operation, String in) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        operation.path("parameters").forEach(p -> {
            if (in.equalsIgnoreCase(p.path("in").asText())) {
                out.put(p.path("name").asText(), p);
            }
        });
        return out;
    }

    /** What is wrong with a query the client sent: a name the operation
     *  does not take, a required one left out, a value not of its type. */
    public List<String> checkQuery(JsonNode operation, Map<String, String> sent) {
        List<String> problems = new ArrayList<>();
        Map<String, JsonNode> taken = parameters(operation, "query");
        sent.forEach((name, value) -> {
            JsonNode param = taken.get(name);
            if (param == null) {
                problems.add("query parameter '" + name + "' is sent, but the operation takes no such parameter "
                        + taken.keySet());
            } else {
                problems.addAll(check(
                        scalar(param.path("schema"), value), param.path("schema"), "query parameter '" + name + "'"));
            }
        });
        taken.forEach((name, param) -> {
            if (param.path("required").asBoolean() && !sent.containsKey(name)) {
                problems.add("query parameter '" + name + "' is required, but is not sent");
            }
        });
        return problems;
    }

    /** A query's text read as the JSON its schema wants, a number as a
     *  number, so it is checked by the same rules as a body. */
    private JsonNode scalar(JsonNode schema, String value) {
        Set<String> types = typesOf(schema);
        if (types.contains("number") || types.contains("integer")) {
            try {
                return types.contains("integer") && value.matches("-?\\d+")
                        ? NODES.numberNode(Long.parseLong(value))
                        : NODES.numberNode(Double.parseDouble(value));
            } catch (NumberFormatException notANumber) {
                return NODES.textNode(value);
            }
        }
        if (types.contains("boolean") && (value.equals("true") || value.equals("false"))) {
            return NODES.booleanNode(Boolean.parseBoolean(value));
        }
        return NODES.textNode(value);
    }

    /** What is wrong with a JSON value the client sends, against the
     *  schema it is sent to; {@code where} names it in each problem. */
    public List<String> check(JsonNode value, JsonNode schema, String where) {
        schema = resolve(schema);
        List<String> problems = new ArrayList<>();
        if (schema.has("anyOf")) {
            // Fits one branch, or is wrong as the first non-null branch says.
            List<String> told = null;
            for (JsonNode branch : schema.get("anyOf")) {
                List<String> found = check(value, branch, where);
                if (found.isEmpty()) {
                    return found;
                }
                if (told == null && !"null".equals(resolve(branch).path("type").asText())) {
                    told = found;
                }
            }
            return told == null ? List.of(where + " fits none of the planner's types for it") : told;
        }
        String type = schema.path("type").asText("");
        if (value == null || value.isNull()) {
            if (!type.equals("null")) {
                problems.add(where + " is sent as null, but the planner does not take null there");
            }
            return problems;
        }
        switch (type) {
            case "object" -> {
                if (!value.isObject()) {
                    problems.add(where + " is sent as " + value.getNodeType() + ", but is an object");
                    break;
                }
                JsonNode properties = schema.path("properties");
                JsonNode extra = schema.path("additionalProperties");
                for (Iterator<Map.Entry<String, JsonNode>> it = value.fields(); it.hasNext(); ) {
                    Map.Entry<String, JsonNode> field = it.next();
                    if (properties.has(field.getKey())) {
                        problems.addAll(
                                check(field.getValue(), properties.get(field.getKey()), where + "." + field.getKey()));
                    } else if (extra.isObject()) {
                        problems.addAll(check(field.getValue(), extra, where + "." + field.getKey()));
                    } else if (!extra.asBoolean(false)) {
                        problems.add(where + "." + field.getKey() + " is sent, but the planner has no such field "
                                + names(properties));
                    }
                }
                schema.path("required").forEach(r -> {
                    if (!value.has(r.asText())) {
                        problems.add(where + "." + r.asText() + " is required, but is not sent");
                    }
                });
            }
            case "array" -> {
                if (!value.isArray()) {
                    problems.add(where + " is sent as " + value.getNodeType() + ", but is an array");
                    break;
                }
                int i = 0;
                for (JsonNode item : value) {
                    problems.addAll(check(item, schema.path("items"), where + "[" + i++ + "]"));
                }
            }
            case "string" -> {
                if (!value.isTextual()) {
                    problems.add(where + " is sent as " + value.getNodeType() + ", but is a string");
                } else if (!fitsFormat(value.asText(), schema)) {
                    problems.add(where + " is sent as '" + value.asText() + "', which is not a "
                            + schema.path("format").asText() + (schema.has("enum") ? " of " + schema.get("enum") : ""));
                }
            }
            case "number" -> {
                if (!value.isNumber()) {
                    problems.add(where + " is sent as " + value.getNodeType() + ", but is a number");
                }
            }
            case "integer" -> {
                if (!value.isIntegralNumber()) {
                    problems.add(where + " is sent as " + value.getNodeType() + ", but is an integer");
                }
            }
            case "boolean" -> {
                if (!value.isBoolean()) {
                    problems.add(where + " is sent as " + value.getNodeType() + ", but is a boolean");
                }
            }
            case "null" -> problems.add(where + " is sent, but the planner takes only null there");
            default -> {
                // No type: any JSON is taken.
            }
        }
        return problems;
    }

    private static boolean fitsFormat(String text, JsonNode schema) {
        if (schema.has("enum")) {
            for (JsonNode e : schema.get("enum")) {
                if (e.asText().equals(text)) {
                    return true;
                }
            }
            return false;
        }
        try {
            switch (schema.path("format").asText("")) {
                case "date" -> LocalDate.parse(text);
                case "date-time" -> OffsetDateTime.parse(text);
                default -> {}
            }
            return true;
        } catch (RuntimeException notIt) {
            return false;
        }
    }

    /** A schema with its $refs followed. */
    public JsonNode resolve(JsonNode schema) {
        while (schema.has("$ref")) {
            String ref = schema.get("$ref").asText();
            schema = document.at(ref.substring(1));
        }
        return schema;
    }

    private Set<String> typesOf(JsonNode schema) {
        schema = resolve(schema);
        Set<String> types = new TreeSet<>();
        if (schema.has("anyOf")) {
            schema.get("anyOf").forEach(b -> types.addAll(typesOf(b)));
        } else {
            types.add(schema.path("type").asText(""));
        }
        return types;
    }

    /** A schema's field names, for a problem to list what there is. */
    static String names(JsonNode properties) {
        List<String> names = new ArrayList<>();
        properties.fieldNames().forEachRemaining(names::add);
        return names.toString();
    }
}
