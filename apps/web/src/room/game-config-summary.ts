const fieldLabels: Record<string, string> = {
  rounds: 'rondas',
  maxRounds: 'rondas máx.',
  roundSeconds: 's por ronda',
  turnSeconds: 's por turno',
  durationSeconds: 's de partida',
  discussionSeconds: 's de debate',
  selectionSeconds: 's para elegir',
  voteSeconds: 's para votar',
  searchSeconds: 's para buscar',
  typeSelectSeconds: 's para elegir tipo',
  laps: 'vueltas',
  groupSize: 'por grupo',
  pokemonCount: 'Pokémon',
  mistakesAllowed: 'errores',
  initialBudget: 'de presupuesto',
};

const priority = [
  'generations', 'rounds', 'maxRounds', 'roundSeconds', 'turnSeconds', 'durationSeconds',
  'discussionSeconds', 'selectionSeconds', 'voteSeconds', 'searchSeconds', 'typeSelectSeconds',
  'laps', 'pokemonCount', 'groupSize', 'mistakesAllowed', 'initialBudget',
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function summarizeGameConfig(config: unknown): string {
  const value = record(config);
  const parts: string[] = [];
  for (const key of priority) {
    const setting = value[key];
    if (key === 'generations' && Array.isArray(setting)) {
      if (setting.length === 9) parts.push('Todas las generaciones');
      else if (setting.length > 0 && setting.length <= 3) parts.push(`Gen ${setting.join(', ')}`);
      else if (setting.length > 0) parts.push(`${setting.length} generaciones`);
    } else if (typeof setting === 'number') {
      parts.push(`${setting} ${fieldLabels[key] ?? key}`);
    }
    if (parts.length === 3) break;
  }
  if (value.memoryPreviewEnabled === true && parts.length < 3) parts.push('Memoria 3 s');
  if (value.hintsEnabled === true && parts.length < 3) parts.push('Con pistas');
  return parts.join(' · ') || 'Configuración lista';
}
