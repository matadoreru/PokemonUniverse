package es.pokemonuniverse.domain.json;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micronaut.json.tree.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JsonTreeTest {

  private static JsonNode obj(Object... kv) {
    var map = new LinkedHashMap<String, JsonNode>();
    for (int i = 0; i < kv.length; i += 2) map.put((String) kv[i], (JsonNode) kv[i + 1]);
    return JsonNode.createObjectNode(map);
  }

  private static JsonNode num(Number n) {
    return JsonNode.createNumberNodeImpl(n);
  }

  private static List<String> keys(JsonNode node) {
    var out = new ArrayList<String>();
    for (Map.Entry<String, JsonNode> e : node.entries()) out.add(e.getKey());
    return out;
  }

  @Test
  void integerAndDoubleAreEqual() {
    assertTrue(JsonTree.equal(num(1), num(1.0)));
    assertTrue(JsonTree.equal(num(1000L), num(1000.0)));
    assertFalse(JsonTree.equal(num(1), num(1.5)));
    assertTrue(JsonTree.equal(num(0.1), num(0.1)));
  }

  @Test
  void nestedTreesCompareIgnoringKeyOrderButNotPresence() {
    var a = obj("x", JsonNode.createArrayNode(List.of(num(1), obj("y", JsonNode.nullNode()))), "z", JsonNode.createStringNode("s"));
    var b = obj("z", JsonNode.createStringNode("s"), "x", JsonNode.createArrayNode(List.of(num(1.0), obj("y", JsonNode.nullNode()))));
    assertTrue(JsonTree.equal(a, b));
    var missing = obj("z", JsonNode.createStringNode("s"), "x", JsonNode.createArrayNode(List.of(num(1), obj())));
    assertFalse(JsonTree.equal(a, missing));
    assertFalse(JsonTree.equal(obj("a", JsonNode.nullNode()), obj("b", JsonNode.nullNode())));
    assertFalse(JsonTree.equal(JsonNode.createArrayNode(List.of(num(1), num(2))), JsonNode.createArrayNode(List.of(num(2), num(1)))));
    assertFalse(JsonTree.equal(JsonNode.createStringNode("1"), num(1)));
    assertFalse(JsonTree.equal(JsonNode.createBooleanNode(true), JsonNode.createBooleanNode(false)));
  }

  @Test
  void canonicalUsesJsPropertyOrder() {
    var node = obj("b", num(1), "10", num(2), "2", num(3), "a", obj("1", num(0), "01", num(0), "0", num(0)));
    var canonical = JsonTree.canonical(node);
    assertEquals(List.of("2", "10", "b", "a"), keys(canonical));
    assertEquals(List.of("0", "1", "01"), keys(canonical.get("a")));
    assertEquals("{\"2\":3,\"10\":2,\"b\":1,\"a\":{\"0\":0,\"1\":0,\"01\":0}}", JsonTree.toCanonicalString(node));
  }

  @Test
  void arrayIndexKeysStopBelowTwoToThe32MinusOne() {
    var node = obj("4294967295", num(1), "4294967294", num(2), "x", num(3));
    assertEquals(List.of("4294967294", "4294967295", "x"), keys(JsonTree.canonical(node)));
  }

  @Test
  void canonicalStringEscapesAndFormatsNumbersLikeJs() {
    var node = obj("s", JsonNode.createStringNode("a\"b\\c\n\u0001é"), "n", num(1.0), "d", num(1.5), "z", JsonNode.nullNode(),
        "t", JsonNode.createBooleanNode(true));
    assertEquals("{\"s\":\"a\\\"b\\\\c\\n\\u0001é\",\"n\":1,\"d\":1.5,\"z\":null,\"t\":true}", JsonTree.toCanonicalString(node));
  }

  private static JsonNode str(String v) {
    return JsonNode.createStringNode(v);
  }

  @Test
  void firstDifferenceIsEmptyWhenEqual() {
    assertTrue(JsonTree.firstDifference("x", obj("a", num(1)), obj("a", num(1.0))).isEmpty());
  }

  @Test
  void firstDifferenceNamesNestedPath() {
    var expected = obj("scores", obj("p1", num(1), "p2", num(2)), "list", JsonNode.createArrayNode(List.of(num(1), str("a"))));
    var actual = obj("scores", obj("p1", num(1), "p2", num(3)), "list", JsonNode.createArrayNode(List.of(num(1), str("a"))));
    assertEquals("afterSteps[3].scores.p2: esperado 2, obtenido 3",
        JsonTree.firstDifference("afterSteps[3]", expected, actual).orElseThrow());
    var arrays = JsonTree.firstDifference("", obj("list", JsonNode.createArrayNode(List.of(num(1), str("a")))),
        obj("list", JsonNode.createArrayNode(List.of(num(1), str("b"))))).orElseThrow();
    assertEquals("list[1]: esperado \"a\", obtenido \"b\"", arrays);
  }

  @Test
  void firstDifferenceDistinguishesAbsentFromNull() {
    assertEquals("k: esperado 1, obtenido <ausente>",
        JsonTree.firstDifference("", obj("k", num(1)), obj()).orElseThrow());
    assertEquals("k: esperado <ausente>, obtenido null",
        JsonTree.firstDifference("", obj(), obj("k", JsonNode.nullNode())).orElseThrow());
    assertEquals("l[1]: esperado <ausente>, obtenido 2",
        JsonTree.firstDifference("", obj("l", JsonNode.createArrayNode(List.of(num(1)))),
            obj("l", JsonNode.createArrayNode(List.of(num(1), num(2))))).orElseThrow());
  }
}
