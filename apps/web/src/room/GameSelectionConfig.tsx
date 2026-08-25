import { supportsPlayerCount, type GameSelectionMode, type MiniGameManifest } from '@pokemon-universe/shared';
import { Check, Repeat2, Shuffle, Vote } from 'lucide-react';

interface Props {
  availableGames: MiniGameManifest[];
  mode: GameSelectionMode;
  playerCount: number;
  disabled: boolean;
  onChange(mode: GameSelectionMode): void;
}

const choices = [
  { type: 'FIXED' as const, icon: Repeat2, title: 'Mismo minijuego', description: 'Se repite el minijuego elegido durante toda la sesión.', requiredGames: 0 },
  { type: 'RANDOM' as const, icon: Shuffle, title: 'Aleatorio', description: 'El servidor sortea un minijuego de la selección en cada partida.', requiredGames: 2 },
  { type: 'VOTE' as const, icon: Vote, title: 'Votación', description: 'Tras la primera partida, todos votan entre 3 opciones aleatorias.', requiredGames: 3 },
];

export function gameAvailabilityReason(game: MiniGameManifest, playerCount: number): string | null {
  if (playerCount < game.minPlayers) return `Necesita al menos ${game.minPlayers} jugadores`;
  if (game.maxPlayers !== undefined && playerCount > game.maxPlayers) return `Máximo ${game.maxPlayers} jugadores`;
  return null;
}

export function GameSelectionConfig({ availableGames, mode, playerCount, disabled, onChange }: Props) {
  const compatibleGames = availableGames.filter((game) => supportsPlayerCount(game, playerCount));
  const configuredIds = mode.type === 'FIXED' ? [] : mode.gameIds;
  const selectedIds = configuredIds.filter((gameId) => compatibleGames.some((game) => game.id === gameId));
  const selected = new Set(selectedIds);
  const minimum = mode.type === 'VOTE' ? 3 : 2;
  const excludedCount = configuredIds.length - selectedIds.length;

  const selectMode = (type: GameSelectionMode['type']) => {
    if (disabled || type === mode.type) return;
    const gameIds = compatibleGames.map((game) => game.id);
    const requiredGames = type === 'VOTE' ? 3 : 2;
    if (type !== 'FIXED' && gameIds.length < requiredGames) return;
    onChange(type === 'FIXED' ? { type } : { type, gameIds });
  };

  const toggleGame = (gameId: string) => {
    if (disabled || mode.type === 'FIXED' || !compatibleGames.some((game) => game.id === gameId)) return;
    const removing = selected.has(gameId);
    let gameIds = removing ? selectedIds.filter((id) => id !== gameId) : [...selectedIds, gameId];
    if (removing && gameIds.length < minimum) return;
    for (const game of compatibleGames) {
      if (gameIds.length >= minimum) break;
      if (!gameIds.includes(game.id)) gameIds.push(game.id);
    }
    if (gameIds.length < minimum) return;
    gameIds = [...new Set(gameIds)];
    onChange({ ...mode, gameIds });
  };

  return <div>
    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Método de selección de minijuegos">
      {choices.map((choice) => {
        const Icon = choice.icon; const active = mode.type === choice.type;
        const unavailable = compatibleGames.length < choice.requiredGames;
        return <button key={choice.type} type="button" disabled={disabled || unavailable} aria-pressed={active} title={unavailable ? `Solo hay ${compatibleGames.length} minijuegos compatibles para ${playerCount} jugadores.` : undefined} className={`session-card ${active ? 'session-card-selected' : ''}`} onClick={() => selectMode(choice.type)}>
          <span className="mb-2 flex items-center justify-between"><Icon size={21} className={active ? 'text-aqua' : 'text-ink/55'} />{active && <Check size={18} className="text-aqua" />}</span>
          <strong>{choice.title}</strong><span>{unavailable ? `No hay ${choice.requiredGames} juegos compatibles para ${playerCount} jugadores.` : choice.description}</span>
        </button>;
      })}
    </div>

    {mode.type !== 'FIXED' && <fieldset className="mt-5 border-t border-ink/10 pt-5">
      <legend className="sr-only">Minijuegos incluidos</legend>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h3 className="font-display text-lg font-bold">Minijuegos incluidos</h3><p className="text-sm font-bold text-ink/60">Selecciona al menos {minimum} compatibles con {playerCount} jugadores.</p></div>
        <span className="chip">{selected.size} seleccionados</span>
      </div>
      {excludedCount > 0 && <p className="status-error mb-3" role="status">{excludedCount === 1 ? 'Un juego seleccionado ya no admite' : `${excludedCount} juegos seleccionados ya no admiten`} el número actual de jugadores. Sustitúyelo antes de iniciar.</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {availableGames.map((game) => {
          const active = selected.has(game.id); const locked = active && selected.size <= minimum;
          const unavailableReason = gameAvailabilityReason(game, playerCount);
          return <button key={game.id} type="button" disabled={disabled || locked || Boolean(unavailableReason)} aria-pressed={active} title={unavailableReason ?? undefined} onClick={() => toggleGame(game.id)} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${active ? 'border-aqua/60 bg-aqua/10' : 'border-ink/10 bg-surface-raised text-ink/60 hover:border-aqua/40'} disabled:cursor-not-allowed disabled:opacity-70`}>
            <span className="text-xl" aria-hidden="true">{game.icon}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{game.name}</strong><small className={`font-bold ${unavailableReason ? 'text-berry' : 'text-ink/55'}`}>{unavailableReason ?? `${game.minPlayers}${game.maxPlayers ? `–${game.maxPlayers}` : '+'} jugadores`}</small></span>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${active ? 'border-aqua bg-aqua text-night' : 'border-ink/20'}`}>{active && <Check size={15} />}</span>
          </button>;
        })}
      </div>
    </fieldset>}
  </div>;
}
