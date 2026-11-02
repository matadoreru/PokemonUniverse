package es.pokemonuniverse.domain.content;

import com.ibm.icu.lang.UCharacter;
import com.ibm.icu.lang.UProperty;
import es.pokemonuniverse.domain.game.engine.infra.JsStrings;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Identidad normalizada del contenido escrito por los usuarios (categorías y dilemas), {@code normalizeContent} de
 * {@code apps/server/src/content/normalize.ts}:
 * {@code value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ')
 * .trim().replace(/\s+/g, ' ')}, en el mismo orden.
 * <ul>
 *   <li>{@code \p{Diacritic}} no existe en las regex de Java: se usa la propiedad binaria de ICU4J
 *   ({@link UProperty#DIACRITIC}), la misma tabla que consulta V8, por punto de código.</li>
 *   <li>{@code toLocaleLowerCase('es')} → {@link String#toLowerCase(Locale)} con el locale {@code es}.</li>
 *   <li>{@code trim()} → {@link JsStrings#trim}.</li>
 * </ul>
 */
public final class ContentNormalizer {

  private static final Locale SPANISH = Locale.forLanguageTag("es");
  private static final Pattern NOT_LETTER_OR_NUMBER = Pattern.compile("[^\\p{L}\\p{N}]+");
  private static final Pattern WHITESPACE_RUN = Pattern.compile("\\s+");

  private ContentNormalizer() {}

  public static String normalize(String value) {
    var decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
    var withoutDiacritics = new StringBuilder(decomposed.length());
    decomposed.codePoints()
        .filter(codePoint -> !UCharacter.hasBinaryProperty(codePoint, UProperty.DIACRITIC))
        .forEach(withoutDiacritics::appendCodePoint);
    var lower = withoutDiacritics.toString().toLowerCase(SPANISH);
    var spaced = JsStrings.trim(NOT_LETTER_OR_NUMBER.matcher(lower).replaceAll(" "));
    return WHITESPACE_RUN.matcher(spaced).replaceAll(" ");
  }
}
