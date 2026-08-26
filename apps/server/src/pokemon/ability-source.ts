export interface SourceAbilityName {
  name: string;
  language: { name: string };
}

/** Keep the official PokéAPI wording instead of translating identifiers locally. */
export function extractSpanishAbilityName(names: readonly SourceAbilityName[]): string | undefined {
  const name = names.find((entry) => entry.language.name === 'es')?.name.trim();
  return name || undefined;
}
