import { playerCountReadinessReason, supportsPlayerCount, type GameSelectionMode, type MiniGameManifest, type RoomView } from '@pokemon-universe/shared/public';
import { AlertCircle, Check, LockKeyhole, Repeat2, Search, Settings2, Shuffle, Vote } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { GameLoadingFallback } from '../components/LoadingFallback';
import { clientGameRegistry } from '../games/registry';
import { Badge, Card, Chip, cx, Field, Icon, Panel, Pill, StateBox } from '../ui';
import { summarizeGameConfig } from './game-config-summary';
import g from './GameSelectionConfig.module.css';
import { filterGames } from './lobby-state';

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
  { type: 'FIXED' as const, icon: Repeat2, title: 'Mismo minijuego', requiredGames: 0 },
  { type: 'RANDOM' as const, icon: Shuffle, title: 'Aleatorio', requiredGames: 2 },
  { type: 'VOTE' as const, icon: Vote, title: 'Votación', requiredGames: 3 },
];

export function gameAvailabilityReason(game: MiniGameManifest, playerCount: number): string | null {
  if (playerCount < game.minPlayers) return `Necesita al menos ${game.minPlayers} jugadores`;
  if (game.maxPlayers !== undefined && playerCount > game.maxPlayers) return `Máximo ${game.maxPlayers} jugadores`;
  return null;
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

/** A player-count requirement (impostor parity) only skips the game in a rotation: it does not block the room. */
export function rotationGameSkipReason(room: RoomView | undefined, game: MiniGameManifest, playerCount: number): string | null {
  return room ? playerCountReadinessReason(game.id, rotationGameConfig(room, game.id), playerCount) : null;
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
    return filterGames(availableGames, query).sort((left, right) =>
      Number(Boolean(right.recommended)) - Number(Boolean(left.recommended))
      || Number(selected.has(right.id)) - Number(selected.has(left.id))
      || left.name.localeCompare(right.name, 'es'),
    );
  }, [availableGames, query, selectedKey]);

  const readiness = useMemo(() => selectedIds.map((gameId) => {
    const game = availableGames.find((candidate) => candidate.id === gameId)!;
    return { game, reason: room ? rotationGameReadinessReason(room, game, playerCount) : null };
  }), [availableGames, playerCount, room, selectedKey]);
  const readyCount = readiness.filter(({ game, reason }) => !reason || rotationGameSkipReason(room, game, playerCount)).length;
  const editingGame = editingGameId ? availableGames.find((game) => game.id === editingGameId) ?? null : null;
  const editingClient = editingGame ? clientGameRegistry.get(editingGame.id) : null;
  const editingConfig = editingGame ? rotationGameConfig(room, editingGame.id) : {};
  const editingReason = editingGame && room ? rotationGameReadinessReason(room, editingGame, playerCount) : null;
  const editingSkipReason = editingGame ? rotationGameSkipReason(room, editingGame, playerCount) : null;

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
    <div className={g.choices} role="group" aria-label="Método de selección de minijuegos">
      {choices.map((choice) => {
        const active = mode.type === choice.type;
        const unavailable = compatibleGames.length < choice.requiredGames;
        // Solo lectura: carta sin botón, sin atenuar (el método elegido se sigue viendo amarillo).
        return <Card key={choice.type} size="sm" art={<Icon icon={choice.icon} size={32} />} name={choice.title} state={active ? 'selected' : 'idle'} disabled={unavailable} {...(disabled ? {} : { onSelect: () => selectMode(choice.type) })}>
          {/* Sin descripción: solo se explica cuando el modo no está disponible. */}
          {unavailable && <span className={g.choiceText}>{`No hay ${choice.requiredGames} juegos compatibles para ${playerCount} jugadores.`}</span>}
        </Card>;
      })}
    </div>

    {mode.type !== 'FIXED' && <fieldset className={g.rotation}>
      <legend className="sr-only">Minijuegos de la rotación</legend>
      <div className={g.head}>
        <div><h3 className={g.title}>Configura la rotación</h3><p className={g.lead}>Elige los juegos y revisa sus ajustes uno a uno.</p></div>
        <Chip tone={readyCount < selected.size ? 'bad' : 'ok'}>{readyCount}/{selected.size} listos</Chip>
      </div>
      {excludedCount > 0 && <p className={g.warn} role="status"><Icon icon={AlertCircle} size={18} />{excludedCount === 1 ? 'Un juego seleccionado ya no admite' : `${excludedCount} juegos seleccionados ya no admiten`} el número actual de jugadores. Sustitúyelo antes de iniciar.</p>}

      <div className={g.split}>
        <section className={g.list} aria-label="Juegos de la rotación">
          <div className={g.listTools}>
            <Field className={cx(g.search)} label="Buscar en la rotación" hideLabel icon={Search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar minijuego" />
            <Badge tone="navy">{selected.size} seleccionados</Badge>
          </div>
          {visibleGames.length > 0 ? <div className={g.items}>
            {visibleGames.map((game) => {
              const active = selected.has(game.id); const locked = active && selected.size <= minimum;
              const unavailableReason = gameAvailabilityReason(game, playerCount);
              const config = rotationGameConfig(room, game.id);
              const configReason = active && room ? rotationGameReadinessReason(room, game, playerCount) : null;
              const skipReason = active ? rotationGameSkipReason(room, game, playerCount) : null;
              const needsReview = Boolean(configReason) && !skipReason;
              const customized = room?.customizedGameIds?.includes(game.id) ?? false;
              const editing = editingGameId === game.id;
              const preload = () => void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined);
              return <article key={game.id} className={cx(g.item, active && g.on, editing && g.editing, !active && g.off)}>
                <div className={g.itemMain}>
                  <button type="button" className={g.toggle} disabled={disabled || locked || Boolean(unavailableReason)} aria-pressed={active} aria-label={`${active ? 'Quitar' : 'Añadir'} ${game.name} ${active ? 'de' : 'a'} la rotación`} title={unavailableReason ?? (locked ? `Debes mantener al menos ${minimum} juegos` : undefined)} onClick={() => toggleGame(game.id)}>
                    <span className={g.box}>{active && <Icon icon={Check} size={18} />}</span>
                  </button>
                  <div className={g.itemText}>
                    <div className={g.itemName}><span aria-hidden="true">{game.icon}</span><strong className={g.name} title={game.name}>{game.name}</strong>{game.recommended && <Badge>TOP</Badge>}{game.experimental && <Badge tone="cream">Experimental</Badge>}</div>
                    <p className={cx(g.summary, (unavailableReason || needsReview) && g.summaryBad)}>{unavailableReason ?? configReason ?? summarizeGameConfig(config)}</p>
                  </div>
                </div>
                {active && <div className={g.itemFoot}>
                  <Chip tone={skipReason ? 'neutral' : needsReview ? 'bad' : customized ? 'info' : 'neutral'}>{skipReason ? 'Se omitirá' : needsReview ? 'Revisar' : customized ? 'Configurado' : 'Predeterminado'}</Chip>
                  <span onPointerEnter={preload} onFocus={preload}>
                    <Pill variant="ghost" size="small" icon={Settings2} aria-pressed={editing} onClick={() => openEditor(game)}>Ajustar</Pill>
                  </span>
                </div>}
              </article>;
            })}
          </div> : <StateBox kind="empty" onCream title={`Ningún minijuego coincide con “${query.trim()}”.`} text="La rotación no cambia: solo filtra la lista." action={{ label: 'Borrar búsqueda', onClick: () => setQuery('') }} />}
        </section>

        <section className={g.editor} aria-live="polite">
          {editingGame && editingClient && room && onConfig
            ? <Panel key={editingGame.id} variant="cream" as="div">
              <div className={g.editorHead}>
                <h4 className={g.title}><span aria-hidden="true">{editingGame.icon}</span> {editingGame.name}</h4>
                <Chip tone={editingSkipReason ? 'neutral' : editingReason ? 'bad' : 'ok'} icon={editingSkipReason ? undefined : <Icon icon={editingReason ? AlertCircle : Check} size={18} />}>{editingSkipReason ? 'Se omitirá' : editingReason ? 'Revisar' : 'Listo'}</Chip>
              </div>
              <p className={g.editorLead}>{editingGame.description}</p>
              {editingSkipReason
                ? <p className={g.editorNote} role="status">{editingSkipReason} Se omitirá en la rotación mientras haya {playerCount} jugadores.</p>
                : editingReason && <p className={cx(g.editorNote, g.editorNoteBad)} role="status">{editingReason}</p>}
              <div className={g.editorBody}>
                {configDisabled && <p className={g.readonly}><Icon icon={LockKeyhole} size={18} />No tienes permiso para editar estos ajustes.</p>}
                <Suspense fallback={<GameLoadingFallback compact />}><editingClient.ConfigPanel config={editingConfig} disabled={configDisabled} room={room} selfId={selfId} onChange={(config) => onConfig(editingGame.id, config)} /></Suspense>
              </div>
            </Panel>
            : <Panel variant="cream" as="div" status={{ kind: 'empty', title: 'Elige un minijuego', text: 'Pulsa «Ajustar» para editar su configuración sin salir del modo de rotación.' }} />}
        </section>
      </div>
    </fieldset>}
  </div>;
}
