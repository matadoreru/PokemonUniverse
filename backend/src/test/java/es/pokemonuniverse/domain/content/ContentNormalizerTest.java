package es.pokemonuniverse.domain.content;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import org.junit.jupiter.api.Test;

/**
 * Esperados obtenidos una vez de {@code normalizeContent} de Node:
 * {@code npx tsx -e "import {normalizeContent} from './apps/server/src/content/normalize.ts'; ..."}.
 */
class ContentNormalizerTest {

  @Test
  void matchesNode() {
    var cases = new LinkedHashMap<String, String>();
    cases.put("  Ñandú—Pikachu!! ", "nandu pikachu");
    cases.put("ÉLÉCTRICO  tipo", "electrico tipo");
    cases.put("İstanbul", "istanbul");
    cases.put("Pikachú", "pikachu");
    cases.put("  Pokémon, PARA  FIESTAS!! ", "pokemon para fiestas");
    cases.put("ǅemal Ⅻ ½ ﬁn ß", "ǆemal ⅻ ½ ﬁn ß");
    cases.put(" x y ", "x y");
    cases.forEach((input, expected) -> assertEquals(expected, ContentNormalizer.normalize(input), input));
  }
}
