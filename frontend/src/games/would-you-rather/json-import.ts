import { importCustomWouldYouRatherPromptsSchema, type ImportCustomWouldYouRatherPrompts } from '@pokemon-universe/shared/public';

export const WOULD_YOU_RATHER_JSON_EXAMPLE = `{
  "version": 1,
  "prompts": [
    {
      "optionA": "Viajar con Lapras",
      "optionB": "Volar con Dragonite"
    }
  ]
}`;

/** Una incidencia de Zod, con lo justo para traducirla (las de Zod 4 traen `code`, `path` y, según el código, más datos). */
interface ImportIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  expected?: unknown;
  values?: readonly unknown[];
  keys?: readonly string[];
}

const TYPE_NAMES: Record<string, string> = { string: 'un texto', number: 'un número', object: 'un objeto', array: 'una lista', boolean: 'verdadero o falso' };

/** Dónde está el fallo: la ruta tal cual (`prompts.0.optionB`) y, si es un dilema, cuál y qué opción, en castellano. */
export function importIssuePlace(path: readonly PropertyKey[]): string {
  if (path.length === 0) return 'raíz';
  const raw = path.map(String).join('.');
  const [root, index, field] = path;
  if (root === 'prompts' && typeof index === 'number') {
    const option = field === 'optionA' ? ', opción A' : field === 'optionB' ? ', opción B' : '';
    return `${raw} (dilema ${index + 1}${option})`;
  }
  return raw;
}

/**
 * Mensaje en castellano de una incidencia. Los mensajes propios del esquema (longitud de las opciones, opciones iguales,
 * número de dilemas) ya vienen en castellano; los genéricos de Zod (tipo, valor, campos de más) se traducen aquí.
 */
export function importIssueMessage(issue: ImportIssue): string {
  switch (issue.code) {
    case 'invalid_type': return issue.expected === undefined ? 'Tipo de dato no válido.' : `Debe ser ${TYPE_NAMES[String(issue.expected)] ?? String(issue.expected)}.`;
    case 'invalid_value':
    case 'invalid_literal': {
      const values = issue.values ?? (issue.expected !== undefined ? [issue.expected] : []);
      return values.length ? `Debe valer ${values.map((value) => JSON.stringify(value)).join(' o ')}.` : 'Valor no válido.';
    }
    case 'unrecognized_keys': return `Campo no admitido: ${(issue.keys ?? []).join(', ')}.`;
    case 'invalid_union': return 'Formato no válido.';
    default: return issue.message;
  }
}

/**
 * Lee e importa el JSON de dilemas (`version: 1`, `prompts` con `optionA` y `optionB`). Los errores salen en castellano:
 * de sintaxis («JSON no válido…», con la línea si el navegador la da) o de formato, con la ruta de cada campo.
 */
export function parseWouldYouRatherImportJson(source: string): ImportCustomWouldYouRatherPrompts {
  let decoded: unknown;
  try { decoded = JSON.parse(source); }
  catch (error) {
    // El mensaje del motor de JSON va en inglés: solo se aprovecha la posición, si la da.
    const position = error instanceof SyntaxError ? /position (\d+)/.exec(error.message)?.[1] : undefined;
    const line = position !== undefined ? source.slice(0, Number(position)).split('\n').length : null;
    throw new Error(`JSON no válido: revisa las comas, las comillas y las llaves${line !== null ? ` (cerca de la línea ${line})` : ''}.`);
  }
  const parsed = importCustomWouldYouRatherPromptsSchema.safeParse(decoded);
  if (parsed.success) return parsed.data;
  const details = parsed.error.issues.map((issue) => `${importIssuePlace(issue.path)}: ${importIssueMessage(issue as unknown as ImportIssue)}`).join(' · ');
  throw new Error(`El JSON no cumple el formato: ${details}`);
}
