import { supportsPlayerCount, type GameSelectionMode, type MiniGameManifest, type RoomView } from '@pokemon-universe/shared';
import { AlertCircle, Check, Repeat2, Search, Settings2, Shuffle, Vote } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { GameLoadingFallback } from '../components/LoadingFallback';
import { clientGameRegistry } from '../games/registry';
import { summarizeGameConfig } from './game-config-summary';

interface Props {
  availableGames: MiniGameManifest[];
  mode: GameSelectionMode;
  playerCount: number;
  disabled: boolean;
  room?: RoomView;
  selfId?: string;
  configDisabled?: boolean;
  onChange(mode: GameSelectionMode): void;
  onConfig?(gameId: string, config: unknown): Promise<void>;
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

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
}

export function rotationGameConfig(room: RoomView | undefined, gameId: string): unknown {
  return room?.gameConfigs?.[gameId] ?? (room?.selectedGameId === gameId ? room.selectedGameConfig : {});
}

export function rotationGameReadinessReason(room: RoomView, game: MiniGameManifest, playerCount: number): string | null {
  const availability = gameAvailabilityReason(game, playerCount);
  if (availability) return availability;
  const client = clientGameRegistry.get(game.id);
  return client.validateConfig?.(rotationGameConfig(room, game.id), room) ?? null;
}

export function GameSelectionConfig({ availableGames, mode, playerCount, disabled, room, selfId = '', configDisabled = disabled, onChange, onConfig }: Props) {
  const compatibleGames = availableGames.filter((game) => supportsPlayerCount(game, playerCount));
  const configuredIds = mode.type === 'FIXED' ? [] : mode.gameIds;
  const selectedIds = configuredIds.filter((gameId) => compatibleGames.some((game) => game.id === gameId));
  const selected = new Set(selectedIds);
  const minimum = mode.type === 'VOTE' ? 3 : 2;
  const excludedCount = configuredIds.length - selectedIds.length;
  const [query, setQuery] = useState('');
  const [editingGameId, setEditingGameId] = useState<string | null>(null);

  useEffect(() => {
    if (mode.type === 'FIXED') { setEditingGameId(null); return; }
    if (!editingGameId || !mode.gameIds.includes(editingGameId)) setEditingGameId(mode.gameIds[0] ?? null);
  }, [editingGameId, mode]);

  const selectedKey = selectedIds.join('|');
  const visibleGames = useMemo(() => {
    const normalized = normalizeSearch(query);
    const games = normalized
      ? availableGames.filter((game) => normalizeSearch(`${game.name} ${game.description}`).includes(normalized))
      : availableGames;
    return [...games].sort((left, right) =>
      Number(Boolean(right.recommended)) - Number(Boolean(left.recommended))
      || Number(selected.has(right.id)) - Number(selected.has(left.id))
      || left.name.localeCompare(right.name, 'es'),
    );
  }, [availableGames, query, selectedKey]);

  const readiness = useMemo(() => selectedIds.map((gameId) => {
    const game = availableGames.find((candidate) => candidate.id === gameId)!;
    return { game, reason: room ? rotationGameReadinessReason(room, game, playerCount) : null };
  }), [availableGames, playerCount, room, selectedKey]);
  const readyCount = readiness.filter(({ reason }) => !reason).length;
  const editingGame = editingGameId ? availableGames.find((game) => game.id === editingGameId) ?? null : null;
  const editingClient = editingGame ? clientGameRegistry.get(editingGame.id) : null;
  const editingConfig = editingGame ? rotationGameConfig(room, editingGame.id) : {};
  const editingReason = editingGame && room ? rotationGameReadinessReason(room, editingGame, playerCount) : null;

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

  const openEditor = (game: MiniGameManifest) => {
    if (mode.type === 'FIXED' || !selected.has(game.id)) return;
    setEditingGameId(game.id);
    void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined);
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
      <legend className="sr-only">Minijuegos de la rotación</legend>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h3 className="font-display text-lg font-bold">Configura la rotación</h3><p className="text-sm font-bold text-ink/60">Elige los juegos y revisa sus ajustes uno a uno.</p></div>
        <span className={`chip ${readyCount < selected.size ? '!bg-berry/10 !text-berry' : '!bg-leaf/10 !text-leaf'}`}>{readyCount}/{selected.size} listos</span>
      </div>
      {excludedCount > 0 && <p className="status-error mb-3" role="status">{excludedCount === 1 ? 'Un juego seleccionado ya no admite' : `${excludedCount} juegos seleccionados ya no admiten`} el número actual de jugadores. Sustitúyelo antes de iniciar.</p>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(18rem,0.82fr)_minmax(24rem,1.18fr)]">
        <section className="rounded-2xl border border-ink/10 bg-ink/[.025] p-3" aria-label="Juegos de la rotación">
          <div className="mb-3 flex items-center gap-2">
            <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar en la rotación</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" size={16} /><input className="field !min-h-10 !pl-9 !text-sm" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar minijuego" /></label>
            <span className="chip shrink-0">{selected.size} seleccionados</span>
          </div>
          <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
            {visibleGames.map((game) => {
              const active = selected.has(game.id); const locked = active && selected.size <= minimum;
              const unavailableReason = gameAvailabilityReason(game, playerCount);
              const config = rotationGameConfig(room, game.id);
              const configReason = active && room ? rotationGameReadinessReason(room, game, playerCount) : null;
              const customized = room?.customizedGameIds?.includes(game.id) ?? false;
              const editing = editingGameId === game.id;
              return <article key={game.id} className={`rounded-xl border p-2.5 transition-colors ${editing ? 'border-aqua bg-aqua/10' : active ? 'border-ink/15 bg-surface-raised' : 'border-transparent bg-ink/[.035] text-ink/60'}`}>
                <div className="flex items-start gap-2.5">
                  <button type="button" disabled={disabled || locked || Boolean(unavailableReason)} aria-pressed={active} aria-label={`${active ? 'Quitar' : 'Añadir'} ${game.name} ${active ? 'de' : 'a'} la rotación`} title={unavailableReason ?? (locked ? `Debes mantener al menos ${minimum} juegos` : undefined)} onClick={() => toggleGame(game.id)} className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border ${active ? 'border-aqua bg-aqua text-night' : 'border-ink/20 bg-surface'} disabled:cursor-not-allowed disabled:opacity-55`}>{active && <Check size={16} />}</button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5"><span aria-hidden="true">{game.icon}</span><strong className="truncate text-sm text-ink">{game.name}</strong>{game.experimental && <span className="experimental-badge">Experimental</span>}{game.recommended && <span className="recommended-badge">TOP</span>}</div>
                    <p className={`mt-0.5 text-xs font-bold leading-snug ${unavailableReason || configReason ? 'text-berry' : 'text-ink/55'}`}>{unavailableReason ?? configReason ?? summarizeGameConfig(config)}</p>
                  </div>
                  {active && <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${configReason ? 'bg-berry' : 'bg-leaf'}`} title={configReason ? 'Requiere revisión' : 'Configuración lista'} />}
                </div>
                {active && <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink/10 pt-2">
                  <span className={`text-[.68rem] font-extrabold uppercase tracking-wide ${configReason ? 'text-berry' : customized ? 'text-aqua' : 'text-ink/45'}`}>{configReason ? 'Revisar' : customized ? 'Configurado' : 'Predeterminado'}</span>
                  <button type="button" onPointerEnter={() => void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined)} onFocus={() => void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined)} onClick={() => openEditor(game)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-aqua hover:bg-aqua/10" aria-pressed={editing}><Settings2 size={14} /> Ajustar</button>
                </div>}
              </article>;
            })}
          </div>
        </section>

        <section className="min-h-72 rounded-2xl border border-ink/10 bg-surface-raised p-4 sm:p-5" aria-live="polite">
          {editingGame && editingClient && room && onConfig ? <>
            <header className="mb-4 border-b border-ink/10 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><span className="label !mb-0">Ajustes de la rotación</span><h4 className="font-display text-xl font-bold"><span aria-hidden="true">{editingGame.icon}</span> {editingGame.name}</h4></div>
                <span className={`chip ${editingReason ? '!bg-berry/10 !text-berry' : '!bg-leaf/10 !text-leaf'}`}>{editingReason ? <><AlertCircle size={14} /> Revisar</> : <><Check size={14} /> Listo</>}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-ink/60">{editingGame.description}</p>
              {editingReason && <p className="status-error mt-3" role="status">{editingReason}</p>}
            </header>
            <div className={configDisabled ? 'lobby-readonly' : ''} title={configDisabled ? 'No tienes permiso para editar estos ajustes.' : undefined}>
              <Suspense fallback={<GameLoadingFallback compact />}><editingClient.ConfigPanel config={editingConfig} disabled={configDisabled} room={room} selfId={selfId} onChange={(config) => onConfig(editingGame.id, config)} /></Suspense>
            </div>
          </> : <div className="grid min-h-64 place-items-center text-center"><div><Settings2 className="mx-auto mb-3 text-ink/35" size={30} /><h4 className="font-display text-lg font-bold">Elige un minijuego</h4><p className="mx-auto mt-1 max-w-sm text-sm font-bold text-ink/55">Pulsa “Ajustar” para editar su configuración sin salir del modo de rotación.</p></div></div>}
        </section>
      </div>
    </fieldset>}
  </div>;
}
