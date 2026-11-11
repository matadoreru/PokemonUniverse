import { gameModeCatalog, NEXT_GAME_VOTE_OPTIONS, playerCountReadinessReason, supportsPlayerCount, type GameSelectionMode, type GameSelectionType, type MiniGameManifest, type RoomView } from '@pokemon-universe/shared/public';
import { AlertCircle, Check, ListOrdered, LockKeyhole, Settings2, Shuffle, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GameLoad } from '../components/LoadingFallback';
import { clientGameRegistry } from '../games/registry';
import { Badge, Card, Chip, cx, Icon, Panel, Pill, StateBox } from '../ui';
import { GameArt } from '../games/GameArt';
import { summarizeGameConfig } from './game-config-summary';
import { SessionModesProvider, type SessionModes } from '../games/common/GameModeField';
import g from './GameSelectionConfig.module.css';
import { playerRangeLabel } from './lobby-state';

export function gameAvailabilityReason(game: MiniGameManifest, playerCount: number): string | null {
  if (playerCount < game.minPlayers) return `Necesita al menos ${game.minPlayers} jugadores`;
  if (game.maxPlayers !== undefined && playerCount > game.maxPlayers) return `Máximo ${game.maxPlayers} jugadores`;
  return null;
}

export function rotationGameConfig(room: RoomView | undefined, gameId: string): unknown {
  return room?.gameConfigs?.[gameId] ?? (room?.selectedGameId === gameId ? room.selectedGameConfig : {});
}

/**
 * Modos que se juegan de `gameId` en la sesión: los de la vista o, en una vista sin ellos, el `mode` de su
 * configuración (como el servidor). Vacía si el juego no tiene modos.
 */
export function allowedModesOf(room: RoomView, gameId: string): string[] {
  const catalog = gameModeCatalog(gameId);
  if (!catalog) return [];
  const allowed = room.allowedModes?.[gameId]?.filter((mode) => catalog.modes.includes(mode)) ?? [];
  if (allowed.length > 0) return allowed;
  const mode = (rotationGameConfig(room, gameId) as { mode?: unknown } | null)?.mode;
  return [typeof mode === 'string' && catalog.modes.includes(mode) ? mode : 'CLASSIC'];
}

/**
 * Turnos de cada juego elegido (primero y último, desde 1). Por orden, cada modo marcado ocupa su propio turno en la
 * cola, seguidos; al azar o por votación, un turno por juego (el orden de la selección).
 */
export function queueSlots(room: RoomView): Record<string, [number, number]> {
  const slots: Record<string, [number, number]> = {};
  let next = 1;
  for (const gameId of room.gameSelectionMode.gameIds) {
    const size = room.gameSelectionMode.type === 'ORDER' ? Math.max(1, allowedModesOf(room, gameId).length) : 1;
    slots[gameId] = [next, next + size - 1];
    next += size;
  }
  return slots;
}

/** «2» o «2–3» (un juego con varios modos en la cola). */
export function queueSlotLabel([first, last]: readonly [number, number]): string {
  return first === last ? `${first}` : `${first}–${last}`;
}

/** Los turnos para el lector: «2», «2 y 3» (dos seguidos) o «2 a 4». */
export function queueSlotSpoken([first, last]: readonly [number, number]): string {
  if (first === last) return `${first}`;
  return last === first + 1 ? `${first} y ${last}` : `${first} a ${last}`;
}

export function rotationGameReadinessReason(room: RoomView, game: MiniGameManifest, playerCount: number): string | null {
  const availability = gameAvailabilityReason(game, playerCount);
  if (availability) return availability;
  const client = clientGameRegistry.get(game.id);
  return client.validateConfig(rotationGameConfig(room, game.id), room);
}

/** A player-count requirement (impostor parity) only skips the game in a rotation: it does not block the room. */
export function rotationGameSkipReason(room: RoomView | undefined, game: MiniGameManifest, playerCount: number): string | null {
  return room ? playerCountReadinessReason(game.id, rotationGameConfig(room, game.id), playerCount) : null;
}

/** El mismo modo con otra lista de minijuegos (la lista no cambia al cambiar de modo, ni el modo al cambiar la lista). */
export function withGameIds(mode: GameSelectionMode, gameIds: string[]): GameSelectionMode {
  return { type: mode.type, gameIds };
}

/** Pone o quita un juego de la selección; el último elegido va al final. Quitar el único deja la lista vacía. */
export function toggleSelectedGame(mode: GameSelectionMode, gameId: string): GameSelectionMode {
  const selected = mode.gameIds.includes(gameId);
  return withGameIds(mode, selected ? mode.gameIds.filter((id) => id !== gameId) : [...mode.gameIds, gameId]);
}

const ORDER_CHOICES: { type: GameSelectionType; icon: typeof Shuffle; title: string }[] = [
  { type: 'ORDER', icon: ListOrdered, title: 'Por orden' },
  { type: 'RANDOM', icon: Shuffle, title: 'Aleatorio' },
  { type: 'VOTE', icon: Vote, title: 'Votación' },
];

/**
 * Qué hará el modo elegido con los juegos compatibles de la selección. `pairCount` cuenta los pares juego y modo: al
 * azar o por votación cada modo marcado es una opción más; por orden, un turno más de la cola.
 */
export function gameOrderHint(type: GameSelectionType, compatibleCount: number, selectedCount: number, pairCount = compatibleCount): string {
  if (selectedCount === 0) return 'Elige al menos un minijuego.';
  if (compatibleCount === 0) return 'Ninguno de los minijuegos elegidos admite a los jugadores de ahora.';
  if (pairCount > compatibleCount) {
    if (type === 'ORDER') return `Se juegan las ${pairCount} partidas de minijuego y modo en el orden de la cola y se vuelve a empezar.`;
    return type === 'RANDOM'
      ? `Cada partida sale al azar entre ${pairCount} opciones de minijuego y modo, sin repetir la anterior.`
      : `Tras cada partida se vota entre ${Math.min(NEXT_GAME_VOTE_OPTIONS, pairCount)} de las ${pairCount} opciones de minijuego y modo.`;
  }
  if (compatibleCount === 1) return 'Con un solo minijuego compatible, se juega siempre ese.';
  if (type === 'ORDER') return `Se juegan los ${compatibleCount} minijuegos en el orden en que los elegiste y se vuelve a empezar.`;
  if (type === 'RANDOM') return `Cada partida sale al azar entre los ${compatibleCount} minijuegos, sin repetir el anterior.`;
  return `Tras cada partida se vota entre ${Math.min(NEXT_GAME_VOTE_OPTIONS, compatibleCount)} de los ${compatibleCount} minijuegos.`;
}

interface OrderProps {
  mode: GameSelectionMode;
  compatibleCount: number;
  /** Opciones (juego y modo) entre los compatibles; por defecto, una por juego. */
  pairCount?: number;
  disabled: boolean;
  /** Falso cuando el aviso ya se pinta en otro sitio (Lobby lo sube con la selección vacía). */
  showHint?: boolean;
  onChange(mode: GameSelectionMode): void;
}

/** Frase de estado del modo de orden: la única región viva de la pestaña. */
export function GameOrderHint({ mode, compatibleCount, pairCount = compatibleCount }: { mode: GameSelectionMode; compatibleCount: number; pairCount?: number }) {
  return <p className={g.hint} role="status">{gameOrderHint(mode.type, compatibleCount, mode.gameIds.length, pairCount)}</p>;
}

/** Pestaña «Modo y sesión»: en qué orden salen los minijuegos elegidos (por orden, al azar o por votación). */
export function GameOrderChoice({ mode, compatibleCount, pairCount = compatibleCount, disabled, showHint = true, onChange }: OrderProps) {
  return <div>
    <div className={g.choices} role="group" aria-label="Orden de los minijuegos">
      {ORDER_CHOICES.map((choice) => (
        // Solo lectura: carta sin botón, sin atenuar (el modo elegido se sigue viendo amarillo).
        <Card key={choice.type} size="sm" art={<Icon icon={choice.icon} size={32} />} name={choice.title} state={mode.type === choice.type ? 'selected' : 'idle'} {...(disabled ? {} : { onSelect: () => { if (choice.type !== mode.type) onChange({ type: choice.type, gameIds: mode.gameIds }); } })} />
      ))}
    </div>
    {showHint && <GameOrderHint mode={mode} compatibleCount={compatibleCount} pairCount={pairCount} />}
  </div>;
}

/**
 * Las casillas «Modos que se juegan» del juego que se ajusta: en las tres formas de sesión (por orden, uno por turno de
 * la cola). `null` (el `Segmented` de un solo modo) si el juego no tiene modos o no se pueden marcar.
 */
export function sessionModesOf(room: RoomView, gameId: string, onAllowedModes: ((gameId: string, modes: string[]) => void) | undefined): SessionModes | null {
  if (!gameModeCatalog(gameId) || !onAllowedModes) return null;
  return { gameId, allowed: allowedModesOf(room, gameId), order: room.gameSelectionMode.type === 'ORDER', onChange: (modes) => onAllowedModes(gameId, modes) };
}

interface ConfigProps {
  room: RoomView;
  selfId: string;
  playerCount: number;
  disabled: boolean;
  onConfig(gameId: string, config: unknown): Promise<void>;
  /** Los modos marcados de un juego con modos (en las tres formas de sesión). */
  onAllowedModes?(gameId: string, modes: string[]): void;
}

/**
 * Pestaña «Configuración»: los ajustes de cada minijuego elegido. Con varios, una lista en el orden de la selección
 * (estado y resumen de cada uno) y el editor del que se ajusta; con uno, solo su editor.
 */
export function SelectedGamesConfig({ room, selfId, playerCount, disabled, onConfig, onAllowedModes }: ConfigProps) {
  const games = room.gameSelectionMode.gameIds
    .map((gameId) => room.availableGames.find((game) => game.id === gameId))
    .filter((game): game is MiniGameManifest => Boolean(game));
  const [editingGameId, setEditingGameId] = useState<string | null>(games[0]?.id ?? null);
  const gameKey = games.map((game) => game.id).join('|');
  useEffect(() => {
    if (!editingGameId || !games.some((game) => game.id === editingGameId)) setEditingGameId(games[0]?.id ?? null);
  }, [editingGameId, gameKey]);

  const editingGame = games.find((game) => game.id === editingGameId) ?? games[0] ?? null;
  const status = (game: MiniGameManifest) => {
    const skipReason = rotationGameSkipReason(room, game, playerCount);
    const reason = rotationGameReadinessReason(room, game, playerCount);
    return { skipReason, reason, needsReview: Boolean(reason) && !skipReason };
  };
  const readyCount = games.filter((game) => !status(game).needsReview).length;
  const slots = queueSlots(room);
  const open = (game: MiniGameManifest) => {
    setEditingGameId(game.id);
    void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined);
  };

  const editor = editingGame ? (() => {
    const client = clientGameRegistry.get(editingGame.id);
    const { skipReason, reason } = status(editingGame);
    const sessionModes = sessionModesOf(room, editingGame.id, onAllowedModes);
    return <Panel key={editingGame.id} variant="cream" as="div">
      <div className={g.editorHead}>
        <h3 className={g.title}><GameArt gameId={editingGame.id} size={22} /> Ajustes de {editingGame.name}</h3>
        <Chip tone={skipReason ? 'neutral' : reason ? 'bad' : 'ok'} icon={skipReason ? undefined : <Icon icon={reason ? AlertCircle : Check} size={18} />}>{skipReason ? 'Se omitirá' : reason ? 'Revisar' : 'Listo'}</Chip>
      </div>
      <p className={g.editorLead}>
        {editingGame.description} · {playerRangeLabel(editingGame)}.
        {editingGame.recommended && <> <Badge>TOP</Badge></>}
        {editingGame.experimental && <> <Badge tone="red">BETA</Badge></>}
      </p>
      {skipReason
        ? <p className={g.editorNote} role="status">{skipReason} Se omitirá mientras haya {playerCount} jugadores.</p>
        : reason && <p className={cx(g.editorNote, g.editorNoteBad)} role="status">{reason}</p>}
      <div className={g.editorBody}>
        {disabled && <p className={g.readonly}><Icon icon={LockKeyhole} size={18} />Solo el host y los co-hosts pueden cambiar estos ajustes.</p>}
        <SessionModesProvider value={sessionModes}>
          <GameLoad compact resetKey={editingGame.id}><client.ConfigPanel config={rotationGameConfig(room, editingGame.id)} disabled={disabled} room={room} selfId={selfId} onChange={(config) => onConfig(editingGame.id, config)} /></GameLoad>
        </SessionModesProvider>
      </div>
    </Panel>;
  })() : null;

  if (games.length === 0) return <section className={g.editor} aria-label="Ajustes del minijuego"><StateBox kind="empty" onCream title="Elige uno o varios minijuegos" /></section>;
  if (games.length <= 1) return <section className={g.editor} aria-label="Ajustes del minijuego">{editor}</section>;

  return <div className={g.rotation}>
    <div className={g.head}>
      <div><h2 className={g.title}>Ajustes de los minijuegos</h2><p className={g.lead}>Revisa los ajustes de cada minijuego elegido.</p></div>
      <Chip tone={readyCount < games.length ? 'bad' : 'ok'}>{readyCount}/{games.length} listos</Chip>
    </div>
    <div className={g.split}>
      <section className={g.list} aria-label="Minijuegos elegidos">
        <ol className={g.items}>
          {games.map((game) => {
            const { skipReason, reason, needsReview } = status(game);
            const customized = room.customizedGameIds?.includes(game.id) ?? false;
            const editing = editingGame?.id === game.id;
            const preload = () => void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined);
            return <li key={game.id} className={cx(g.item, g.on, editing && g.editing)}>
              <div className={g.itemMain}>
                <span className={g.order} aria-hidden="true">{queueSlotLabel(slots[game.id] ?? [1, 1])}</span>
                <div className={g.itemText}>
                  <div className={g.itemName}><GameArt gameId={game.id} size={22} /><strong className={g.name} title={game.name}>{game.name}</strong></div>
                  <p className={cx(g.summary, needsReview && g.summaryBad)}>{reason ?? summarizeGameConfig(rotationGameConfig(room, game.id))}</p>
                </div>
              </div>
              <div className={g.itemFoot}>
                <Chip tone={skipReason ? 'neutral' : needsReview ? 'bad' : customized ? 'info' : 'neutral'}>{skipReason ? 'Se omitirá' : needsReview ? 'Revisar' : customized ? 'Configurado' : 'Predeterminado'}</Chip>
                <span onPointerEnter={preload} onFocus={preload}>
                  <Pill variant="ghost" size="small" icon={Settings2} aria-pressed={editing} aria-label={`Ajustar ${game.name}`} onClick={() => open(game)}>Ajustar</Pill>
                </span>
              </div>
            </li>;
          })}
        </ol>
      </section>
      <section className={g.editor} aria-live="polite" aria-label="Ajustes del minijuego">{editor}</section>
    </div>
  </div>;
}

/**
 * Juegos de la selección que admiten a los conectados (los que puede sacar el modo): un requisito de jugadores (rango
 * del manifest o paridad de impostores) excluye el juego, como en el servidor.
 */
export function compatibleSelectedGameIds(room: RoomView, playerCount: number): string[] {
  return room.gameSelectionMode.gameIds.filter((gameId) => {
    const game = room.availableGames.find((candidate) => candidate.id === gameId);
    return Boolean(game && supportsPlayerCount(game, playerCount) && playerCountReadinessReason(gameId, rotationGameConfig(room, gameId), playerCount) === null);
  });
}
