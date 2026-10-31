package es.pokemonuniverse.golden;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.domain.game.engine.infra.Immutables;
import io.micronaut.json.tree.JsonNode;
import io.micronaut.serde.ObjectMapper;
import io.micronaut.serde.annotation.Serdeable;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.SortedMap;
import org.junit.jupiter.api.Test;

class OrderedJsonCompareTest {

  private static JsonNode json(String text) throws IOException {
    return ObjectMapper.getDefault().readValue(text, JsonNode.class);
  }

  private static Optional<String> diff(String expected, String actual) throws IOException {
    return OrderedJsonCompare.firstDifference("x", json(expected), json(actual));
  }

  @Test
  void keyOrderMatters() throws IOException {
    var found = diff("{\"a\":1,\"b\":2}", "{\"b\":2,\"a\":1}");
    assertTrue(found.isPresent());
    assertEquals("x: orden de claves esperado [a,b] obtenido [b,a]", found.get());
  }

  @Test
  void numbersCompareByValue() throws IOException {
    assertEquals(Optional.empty(), diff("{\"a\":1}", "{\"a\":1.0}"));
  }

  @Test
  void nestedOrderReportsTheNestedPath() throws IOException {
    var found = OrderedJsonCompare.firstDifference("", json("{\"x\":{\"b\":1,\"a\":2}}"), json("{\"x\":{\"a\":2,\"b\":1}}"));
    assertTrue(found.orElseThrow().startsWith("x: orden de claves"), found.get());
  }

  @Test
  void nullDiffersFromAbsent() throws IOException {
    assertEquals(Optional.of("x.a: esperado null, obtenido <ausente>"), diff("{\"a\":null}", "{}"));
    assertEquals(Optional.of("x.a: esperado <ausente>, obtenido null"), diff("{}", "{\"a\":null}"));
  }

  @Test
  void valueAndArrayDifferencesKeepThePath() throws IOException {
    assertEquals(Optional.of("x.a[1]: esperado 2, obtenido 3"), diff("{\"a\":[1,2]}", "{\"a\":[1,3]}"));
    assertEquals(Optional.of("x.a[2]: esperado <ausente>, obtenido 3"), diff("{\"a\":[1,2]}", "{\"a\":[1,2,3]}"));
    assertEquals(Optional.empty(), diff("{\"a\":[{\"b\":true}],\"c\":\"t\"}", "{\"a\":[{\"b\":true}],\"c\":\"t\"}"));
  }

  /** El replayer depende de que Serde conserve el orden del texto al parsear las fixtures. */
  @Test
  void testMapperKeepsParsedKeyOrder() throws IOException {
    var keys = new ArrayList<String>();
    for (Map.Entry<String, JsonNode> entry : json("{\"b\":1,\"a\":2}").entries()) keys.add(entry.getKey());
    assertEquals(java.util.List.of("b", "a"), keys);
  }

  @Serdeable
  record Numbered(SortedMap<Integer, String> byNumber) {}

  /** Constraint 14: un {@code Record<number, …>} de TS se serializa con claves numéricas ascendentes. */
  @Test
  void sortedIntegerMapSerializesAscending() throws IOException {
    var source = new LinkedHashMap<Integer, String>();
    source.put(10, "a");
    source.put(2, "b");
    var tree = GoldenReplayer.tree(new Numbered(Immutables.frozenSortedMap(source)));
    assertEquals(Optional.empty(),
        OrderedJsonCompare.firstDifference("", json("{\"byNumber\":{\"2\":\"b\",\"10\":\"a\"}}"), tree), tree.toString());
  }
}
