import { importCustomWouldYouRatherPromptsSchema, type ImportCustomWouldYouRatherPrompts } from '@pokemon-universe/shared';

export const WOULD_YOU_RATHER_JSON_EXAMPLE = `{
  "version": 1,
  "prompts": [
    {
      "optionA": "Viajar con Lapras",
      "optionB": "Volar con Dragonite"
    }
  ]
}`;

export function parseWouldYouRatherImportJson(source: string): ImportCustomWouldYouRatherPrompts {
  let decoded: unknown;
  try { decoded = JSON.parse(source); }
  catch (error) {
    const detail = error instanceof SyntaxError ? error.message : 'JSON ilegible';
    throw new Error(`JSON no válido: ${detail}`);
  }
  const parsed = importCustomWouldYouRatherPromptsSchema.safeParse(decoded);
  if (parsed.success) return parsed.data;
  const details = parsed.error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : 'raíz'}: ${issue.message}`).join(' · ');
  throw new Error(`El JSON no cumple el formato: ${details}`);
}
