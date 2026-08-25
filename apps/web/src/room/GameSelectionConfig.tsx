import type { GameSelectionMode, MiniGameManifest } from '@pokemon-universe/shared';
import { Check, Repeat2, Shuffle, Vote } from 'lucide-react';

interface Props {
  availableGames: MiniGameManifest[];
  mode: GameSelectionMode;
  disabled: boolean;
  onChange(mode: GameSelectionMode): void;
}

const choices = [
  { type: 'FIXED' as const, icon: Repeat2, title: 'Mismo minijuego', description: 'Se repite el minijuego elegido durante toda la sesión.' },
  { type: 'RANDOM' as const, icon: Shuffle, title: 'Aleatorio', description: 'El servidor sortea un minijuego de la selección en cada partida.' },
  { type: 'VOTE' as const, icon: Vote, title: 'Votación', description: 'Tras la primera partida, todos votan entre 3 opciones aleatorias.' },
];

export function GameSelectionConfig({ availableGames, mode, disabled, onChange }: Props) {
  const selectedIds = mode.type === 'FIXED' ? [] : mode.gameIds;
  const selected = new Set(selectedIds);
  const minimum = mode.type === 'VOTE' ? 3 : 2;

  const selectMode = (type: GameSelectionMode['type']) => {
    if (disabled || type === mode.type) return;
    const gameIds = availableGames.map((game) => game.id);
    onChange(type === 'FIXED' ? { type } : { type, gameIds });
  };

  const toggleGame = (gameId: string) => {
    if (disabled || mode.type === 'FIXED') return;
    const gameIds = selected.has(gameId) ? mode.gameIds.filter((id) => id !== gameId) : [...mode.gameIds, gameId];
    if (gameIds.length < minimum) return;
    onChange({ ...mode, gameIds });
  };

  return <div>
    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Método de selección de minijuegos">
      {choices.map((choice) => {
        const Icon = choice.icon; const active = mode.type === choice.type;
        return <button key={choice.type} type="button" disabled={disabled} aria-pressed={active} className={`session-card ${active ? 'session-card-selected' : ''}`} onClick={() => selectMode(choice.type)}>
          <span className="mb-2 flex items-center justify-between"><Icon size={21} className={active ? 'text-aqua' : 'text-ink/55'} />{active && <Check size={18} className="text-aqua" />}</span>
          <strong>{choice.title}</strong><span>{choice.description}</span>
        </button>;
      })}
    </div>

    {mode.type !== 'FIXED' && <fieldset className="mt-5 border-t border-ink/10 pt-5">
      <legend className="sr-only">Minijuegos incluidos</legend>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h3 className="font-display text-lg font-bold">Minijuegos incluidos</h3><p className="text-sm font-bold text-ink/60">Selecciona al menos {minimum}.</p></div>
        <span className="chip">{selected.size} seleccionados</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {availableGames.map((game) => {
          const active = selected.has(game.id); const locked = active && selected.size <= minimum;
          return <button key={game.id} type="button" disabled={disabled || locked} aria-pressed={active} onClick={() => toggleGame(game.id)} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${active ? 'border-aqua/60 bg-aqua/10' : 'border-ink/10 bg-surface-raised text-ink/60 hover:border-aqua/40'} disabled:cursor-not-allowed disabled:opacity-70`}>
            <span className="text-xl" aria-hidden="true">{game.icon}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{game.name}</strong><small className="font-bold text-ink/55">{game.minPlayers}{game.maxPlayers ? `–${game.maxPlayers}` : '+'} jugadores</small></span>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${active ? 'border-aqua bg-aqua text-night' : 'border-ink/20'}`}>{active && <Check size={15} />}</span>
          </button>;
        })}
      </div>
    </fieldset>}
  </div>;
}
