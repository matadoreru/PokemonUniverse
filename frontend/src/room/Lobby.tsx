import { formatPendingReadyNames, gameModeCount, gameModeLabel, gameModeName, hasRoomPermission, playerCountReadinessReason, supportsPlayerCount, type GameSelectionMode, type RoomView, type SessionMode } from '@pokemon-universe/shared/public';
import { Check, CheckCircle2, UserPlus, Flag, Gamepad2, Hash, Headphones, Infinity as InfinityIcon, LockKeyhole, Play, Search, Settings2, Shuffle, Trophy, Users, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOptionalFriends } from '../friends/FriendsContext';
import { canInviteFriend } from '../friends/FriendsDrawer';
import { clientGameRegistry } from '../games/registry';
import { Badge, Card, Chip, cx, Field, Icon, Panel, Pill, StateBox, TabPanel, Tabs, type TabItem } from '../ui';
import { GameArt } from '../games/GameArt';
import { allowedModesOf, GameOrderChoice, GameOrderHint, SelectedGamesConfig, toggleSelectedGame } from './GameSelectionConfig';
import { connectedCount, filterGames, lobbyActionStatus, playerRangeLabel } from './lobby-state';
import { RoomPlayersPanel } from './RoomPlayersPanel';
import { SessionScreen } from './SessionScreen';
import s from './Lobby.module.css';

interface Props {
  room: RoomView;
  selfId: string;
  /** Sin uso: la salida vive en la placa de la sala de la cabecera (RoomPlate). Se mantiene porque RoomPage aún lo pasa. */
  onLeave(): void;
  onReady(ready: boolean): Promise<void>;
  onStart(): Promise<void>;
  onGameConfig(gameId: string, config: unknown): Promise<void>;
  onSession(mode: SessionMode): Promise<void>;
  onGameSelection(mode: GameSelectionMode): Promise<void>;
  /** Al azar o por votación: los modos que pueden salir de un juego. Opcional: sin él, el panel queda como con el host eligiendo. */
  onAllowedModes?(gameId: string, modes: string[]): Promise<void>;
  onSetRoomRole(playerId: string, role: 'CO_HOST' | 'MEMBER'): Promise<void>;
  onTransferHost(playerId: string): Promise<void>;
  onKick(playerId: string): Promise<void>;
  onEndSession(): void;
}

type LobbyTab = 'games' | 'config' | 'session';
const TAB_ID = 'lobby';
const TABS: TabItem<LobbyTab>[] = [
  { key: 'games', label: 'Minijuegos', icon: Gamepad2 },
  { key: 'config', label: 'Configuración', icon: Settings2 },
  // En el móvil se lee «Modo»; el nombre accesible sigue siendo «Modo y sesión».
  { key: 'session', label: <>Modo<span className="max-sm:sr-only"> y sesión</span></>, icon: Shuffle },
];

export function Lobby({ room, selfId, onReady, onStart, onGameConfig, onSession, onGameSelection, onAllowedModes, onSetRoomRole, onTransferHost, onKick, onEndSession }: Props) {
  const self = room.members.find((member) => member.id === selfId);
  const roomRole = self?.roomRole ?? 'MEMBER';
  const canEditGame = hasRoomPermission(roomRole, 'EDIT_GAME_CONFIG');
  const canEditSession = hasRoomPermission(roomRole, 'EDIT_SESSION');
  const canEditGameSelection = hasRoomPermission(roomRole, 'EDIT_GAME_SELECTION');
  const canStart = hasRoomPermission(roomRole, 'START_GAME');
  const canManageRoles = hasRoomPermission(roomRole, 'MANAGE_ROLES');
  const gameClient = clientGameRegistry.get(room.selectedGameId);
  const connectedPlayers = connectedCount(room.members);
  const pendingReady = room.members.filter((member) => member.presence === 'CONNECTED' && member.id !== room.hostId && !member.ready);
  const hostMember = room.members.find((member) => member.id === room.hostId);
  const [readyBusy, setReadyBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameQuery, setGameQuery] = useState('');
  const [activeTab, setActiveTab] = useState<LobbyTab>('games');

  useEffect(() => {
    const preloadTimer = window.setTimeout(() => { void gameClient.preloadGameplay().catch(() => undefined); }, 600);
    return () => window.clearTimeout(preloadTimer);
  }, [gameClient]);

  // El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí solo se captura.
  const ignoreFailure = () => undefined;
  const toggleReady = async () => {
    if (!self || self.roomRole === 'HOST' || readyBusy) return;
    setReadyBusy(true);
    try { await onReady(!self.ready); } catch { ignoreFailure(); }
    finally { setReadyBusy(false); }
  };
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try { await onStart(); } catch { setStarting(false); }
  };
  const session = (mode: SessionMode) => { if (canEditSession) void onSession(mode).catch(ignoreFailure); };
  const gameSelection = (mode: GameSelectionMode) => { if (canEditGameSelection) void onGameSelection(mode).catch(ignoreFailure); };
  // Sin permiso, el panel enseña igual los modos marcados (sus píldoras quedan inertes): solo se bloquea la escritura.
  const allowedModes = onAllowedModes ? (gameId: string, modes: string[]) => { if (canEditGame) void onAllowedModes(gameId, modes).catch(ignoreFailure); } : undefined;
  // Al azar o por votación cada modo marcado es una opción más (en orden, el modo de la configuración).
  const pickedByChance = room.gameSelectionMode.type !== 'ORDER';
  // Las cartas eligen varios juegos: pulsar pone o quita uno (el último elegido va al final; la lista puede quedar vacía).
  const toggleGame = (gameId: string) => gameSelection(toggleSelectedGame(room.gameSelectionMode, gameId));
  // La confirmación (expulsar, transferir el Host) la pide el diálogo de la lista de jugadores.
  const transferHost = (playerId: string) => { void onTransferHost(playerId).catch(ignoreFailure); };
  const kick = (playerId: string) => { void onKick(playerId).catch(ignoreFailure); };

  const rotationConfig = (gameId: string): unknown => room.gameConfigs?.[gameId] ?? (gameId === room.selectedGameId ? room.selectedGameConfig : {});
  // Con varios juegos, un requisito de jugadores (rango del manifest o paridad de impostores) excluye el juego, como en el servidor.
  const rotationPlayable = (gameId: string): boolean => {
    const manifest = room.availableGames.find((game) => game.id === gameId);
    return Boolean(manifest && supportsPlayerCount(manifest, connectedPlayers)
      && playerCountReadinessReason(gameId, rotationConfig(gameId), connectedPlayers) === null);
  };
  const selectedGameIds = room.gameSelectionMode.gameIds;
  const compatibleGameIds = selectedGameIds.filter(rotationPlayable);
  const pairCount = pickedByChance ? compatibleGameIds.reduce((count, gameId) => count + Math.max(1, allowedModesOf(room, gameId).length), 0) : compatibleGameIds.length;
  const configReason = (selectedGameIds.length === 1 ? selectedGameIds : compatibleGameIds).map((gameId) => {
    const manifest = room.availableGames.find((game) => game.id === gameId);
    if (!manifest) return null;
    const reason = clientGameRegistry.get(gameId).validateConfig?.(rotationConfig(gameId), room) ?? null;
    return reason ? (selectedGameIds.length === 1 ? reason : `${manifest.name}: ${reason}`) : null;
  }).find((reason) => reason !== null) ?? null;
  // Un solo juego: el motivo exacto (mínimo o máximo de jugadores), como el servidor.
  const onlyManifest = selectedGameIds.length === 1 ? room.availableGames.find((game) => game.id === selectedGameIds[0]) : undefined;
  const playerCountReason = onlyManifest
    ? connectedPlayers < onlyManifest.minPlayers
      ? `Se necesitan al menos ${onlyManifest.minPlayers} jugadores conectados.`
      : onlyManifest.maxPlayers !== undefined && connectedPlayers > onlyManifest.maxPlayers
        ? `Este juego admite un máximo de ${onlyManifest.maxPlayers} jugadores.`
        : null
    : compatibleGameIds.length === 0 ? 'Ningún minijuego elegido admite el número actual de jugadores.' : null;
  const startReason = !canStart
    ? 'Solo el host puede iniciar la partida.'
    : selectedGameIds.length === 0
      ? 'Elige al menos un minijuego para empezar.'
      : pendingReady.length > 0
        ? `Falta por confirmar: ${formatPendingReadyNames(pendingReady.map((member) => member.displayName))}.`
        : playerCountReason ?? configReason;
  const status = lobbyActionStatus({ canStart, ready: Boolean(self?.ready), startReason, hostName: hostMember?.displayName });
  const visibleGames = filterGames(room.availableGames, gameQuery);
  const readOnlyChip = <Chip icon={<Icon icon={LockKeyhole} size={18} />}>Solo lectura</Chip>;

  const action = (
    <Panel variant="cream" as="div" bodyClassName={cx(s.actionBody)}>
      <div className={s.status}>
        <span className={s.kicker}>{status.kicker}</span>
        <h2 className={s.actionTitle}>{status.title}</h2>
        <p id="start-help" className={cx(s.help, status.ok ? s.ok : s.bad)}>{status.text}</p>
      </div>
      <div className={s.buttons}>
        {self?.roomRole !== 'HOST' && (
          <Pill variant="yellow" size="main" icon={self?.ready ? Check : CheckCircle2} loading={readyBusy} disabled={self?.presence !== 'CONNECTED'} aria-pressed={Boolean(self?.ready)} aria-describedby="start-help" onClick={() => void toggleReady()}>
            {self?.ready ? 'Estoy listo' : 'Marcarme listo'}
          </Pill>
        )}
        {canStart && (
          <Pill variant="red" size="main" icon={Play} loading={starting} disabled={Boolean(startReason)} aria-describedby="start-help" onClick={() => void start()}>
            ¡Empezar partida!
          </Pill>
        )}
      </div>
    </Panel>
  );

  const side = (
    <div className={s.side}>
      <LobbyInviteButton room={room} />
      <RoomPlayersPanel className="lg:flex-1" bodyClassName={s.playersBody ?? ''} members={room.members} maxPlayers={room.maxPlayers} selfId={selfId} canManage={canManageRoles} onSetRoomRole={(id, role) => void onSetRoomRole(id, role).catch(ignoreFailure)} onTransferHost={transferHost} onKick={kick} />
      <aside className={s.tip} aria-label="Recomendación para jugar">
        <Icon icon={Headphones} size={22} className={s.tipIcon} />
        <p>
          <strong className={s.tipTitle}>Hablando es mejor</strong>
          Te recomendamos estar en una llamada de voz con tus amigos, por Discord, Zoom o vuestra aplicación favorita.
        </p>
      </aside>
    </div>
  );

  const gamesPanel = (
    <>
      <div className={s.head}>
        <div className={s.headText}>
          <h2 className={s.title}>Elige los minijuegos</h2>
          <p className={s.lead}>{selectedGameIds.length === 1 ? '1 elegido' : `${selectedGameIds.length} elegidos`} · el número de cada carta es su orden en la sesión.</p>
        </div>
        <div className={s.tools}>
          {!canEditGameSelection && readOnlyChip}
          <Field className={cx(s.search)} label="Buscar minijuego" hideLabel icon={Search} type="search" value={gameQuery} onChange={(event) => setGameQuery(event.target.value)} placeholder={`Buscar entre ${room.availableGames.length} juegos`} />
        </div>
      </div>
      {visibleGames.length > 0 ? (
        <ul className={s.grid} aria-label="Minijuegos" aria-describedby={canEditGameSelection ? undefined : 'game-permission-help'}>
          {visibleGames.map((game) => {
            const position = selectedGameIds.indexOf(game.id) + 1;
            const selected = position > 0;
            const preloadConfig = () => { void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined); };
            const modeLabel = lobbyModeLabel(room, game.id, pickedByChance);
            const modeCount = gameModeCount(game.id);
            return (
              <li key={game.id} className={s.cell} onPointerEnter={preloadConfig} onFocus={preloadConfig}>
                {/* Solo lectura: carta sin botón (no se atenúa, la elegida se sigue viendo amarilla). */}
                <Card size="sm" art={<GameArt gameId={game.id} size={32} />} name={game.name} state={selected ? 'selected' : 'idle'} {...(canEditGameSelection ? { onSelect: () => toggleGame(game.id) } : {})}>
                  <span className={s.players}><Icon icon={Users} size={18} />{playerRangeLabel(game)}</span>
                  {/* Juego con varios modos: «N modos»; y el modo que sale si no es Clásico (o «N modos en juego»). */}
                  {(modeCount > 1 || modeLabel) && <span className={s.modes}>
                    {modeCount > 1 && <Chip>{`${modeCount} modos`}</Chip>}
                    {modeLabel && <Chip tone="info">{modeLabel}</Chip>}
                  </span>}
                  {/* Elegida: su número de orden en la esquina superior izquierda, para que la carta no cambie de tamaño
                      (el estado ya lo dicen el amarillo y `aria-pressed`). */}
                  {selected && <><span className={s.tick} aria-hidden="true">{position}</span><span className="sr-only">{`, n.º ${position} de la sesión`}</span></>}
                  {/* TOP y BETA en la esquina superior derecha de la carta. */}
                  {(game.recommended || game.experimental) && (
                    <span className={s.corner}>
                      {game.recommended && <Badge>TOP</Badge>}
                      {game.experimental && <Badge tone="red">BETA</Badge>}
                    </span>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <StateBox kind="empty" onCream title={`No hay minijuegos que coincidan con “${gameQuery.trim()}”.`} text="Busca por nombre o por lo que se hace en el juego, como «tipo» o «shiny»." action={{ label: 'Borrar búsqueda', onClick: () => setGameQuery('') }} />
      )}
      {!canEditGameSelection && <p id="game-permission-help" className={s.readonly}><Icon icon={LockKeyhole} size={18} />Solo el host y los co-hosts pueden elegir los minijuegos.</p>}
    </>
  );

  // Sin panel propio: el editor de cada juego ya es un panel crema (dos anidados no caben a 390 px).
  const configPanel = <SelectedGamesConfig room={room} selfId={selfId} playerCount={connectedPlayers} disabled={!canEditGame} onConfig={onGameConfig} {...(allowedModes ? { onAllowedModes: allowedModes } : {})} />;

  const selectionEmpty = room.gameSelectionMode.gameIds.length === 0;
  const sessionTarget = room.sessionMode.type === 'GAME_COUNT' || room.sessionMode.type === 'POINT_TARGET' ? room.sessionMode.target : null;
  const sessionPanel = (
    <>
      {/* Con la selección vacía el aviso va arriba del todo: a 390 px el resto de la pestaña queda bajo el pliegue. */}
      {selectionEmpty && <GameOrderHint mode={room.gameSelectionMode} compatibleCount={compatibleGameIds.length} pairCount={pairCount} />}
      <div className={s.head}>
        <div className={s.headText}>
          <h2 className={s.title}>Modo y sesión</h2>
          <p className={s.lead}>Define en qué orden salen los minijuegos elegidos y cuándo se decide el ganador.</p>
        </div>
      </div>
      <section className={s.section} aria-labelledby="rotation-heading">
        <div className={s.head}>
          <div className={s.headText}>
            <h3 id="rotation-heading" className={s.subtitle}>Orden de los minijuegos</h3>
            <p className={s.lead}>Decide qué minijuego sale en cada partida.</p>
          </div>
          {!canEditGameSelection && readOnlyChip}
        </div>
        <GameOrderChoice mode={room.gameSelectionMode} compatibleCount={compatibleGameIds.length} pairCount={pairCount} disabled={!canEditGameSelection} showHint={!selectionEmpty} onChange={gameSelection} />
      </section>
      <section className={s.section} aria-labelledby="format-heading">
        <div className={s.head}>
          <div className={s.headText}>
            <h3 id="format-heading" className={s.subtitle}>Final de la sesión</h3>
            <p className={s.lead}>Elige cómo se decide el ganador de la sesión.</p>
          </div>
          {!canEditSession && readOnlyChip}
        </div>
        <div className={s.choices}>
          {([
            { type: 'INFINITE', icon: InfinityIcon, name: 'Infinita', mode: { type: 'INFINITE' } },
            { type: 'GAME_COUNT', icon: Hash, name: room.sessionMode.type === 'GAME_COUNT' ? `${room.sessionMode.target} partidas` : 'Por partidas', mode: { type: 'GAME_COUNT', target: room.sessionMode.type === 'GAME_COUNT' ? room.sessionMode.target : 5 } },
            { type: 'POINT_TARGET', icon: Trophy, name: room.sessionMode.type === 'POINT_TARGET' ? `${room.sessionMode.target} puntos` : 'Por puntos', mode: { type: 'POINT_TARGET', target: room.sessionMode.type === 'POINT_TARGET' ? room.sessionMode.target : 50 } },
          ] satisfies { type: SessionMode['type']; icon: typeof Hash; name: string; mode: SessionMode }[]).map((choice) => (
            <Card key={choice.type} size="sm" art={<Icon icon={choice.icon} size={32} />} name={choice.name} state={room.sessionMode.type === choice.type ? 'selected' : 'idle'} {...(canEditSession ? { onSelect: () => session(choice.mode) } : {})}>
            </Card>
          ))}
        </div>
        {room.sessionMode.type === 'GAME_COUNT' && sessionTarget !== null && <Field className={cx(s.target)} label="Número de partidas" type="number" min={1} max={100} disabled={!canEditSession} value={sessionTarget} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 1 && target <= 100) session({ type: 'GAME_COUNT', target }); }} />}
        {room.sessionMode.type === 'POINT_TARGET' && sessionTarget !== null && <Field className={cx(s.target)} label="Puntos para ganar" type="number" min={5} max={10000} step={5} disabled={!canEditSession} value={sessionTarget} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 5 && target <= 10000) session({ type: 'POINT_TARGET', target }); }} />}
        {hasRoomPermission(roomRole, 'END_SESSION') && room.gamesPlayed > 0 && <Pill variant="danger" icon={Flag} className={s.endSession} onClick={onEndSession}>Finalizar sesión y ver clasificación</Pill>}
      </section>
    </>
  );

  const main = (
    <div className={s.main}>
      {/* El código y «Salir» están en la placa de la sala de la cabecera (RoomPlate); aquí queda el encabezado para el foco de ruta. */}
      <h1 className="sr-only">Lobby de la sala</h1>
      {hostMember?.presence === 'TEMPORARILY_DISCONNECTED' && (
        <div className={s.notice} role="status" aria-live="polite">
          <span className={s.noticeBadge}><Icon icon={WifiOff} size={22} /></span>
          <span>
            <strong className={s.noticeTitle}>El host está reconectando.</strong>
            <span className={s.noticeText}>La sala conserva la configuración y esperará antes de transferir el control.</span>
          </span>
        </div>
      )}
      <div className={s.tabbed}>
        <Tabs items={TABS} active={activeTab} onChange={setActiveTab} label="Secciones del lobby" idBase={TAB_ID} className={cx(s.tabs)} />
        {/* Los tres paneles quedan montados: cambiar de pestaña no pierde búsquedas ni ajustes a medio confirmar. */}
        <TabPanel idBase={TAB_ID} tabKey="games" hidden={activeTab !== 'games'} className={cx(s.body)}>{gamesPanel}</TabPanel>
        <TabPanel idBase={TAB_ID} tabKey="config" hidden={activeTab !== 'config'} className={cx(s.body)}>{configPanel}</TabPanel>
        <TabPanel idBase={TAB_ID} tabKey="session" hidden={activeTab !== 'session'} className={cx(s.body)}>{sessionPanel}</TabPanel>
      </div>
    </div>
  );

  return (
    <>
      <SessionScreen side={side} action={action} main={main} />
    </>
  );
}

/**
 * Chip de modo de la carta del lobby: con el host eligiendo, el modo de la configuración si no es Clásico; al azar o
 * por votación, «N modos en juego» si hay varios marcados o el nombre del único si no es Clásico. `null` sin chip.
 */
export function lobbyModeLabel(room: RoomView, gameId: string, pickedByChance: boolean): string | null {
  const config = room.gameConfigs?.[gameId] ?? (gameId === room.selectedGameId ? room.selectedGameConfig : {});
  if (!pickedByChance) return gameModeLabel(gameId, config);
  const allowed = allowedModesOf(room, gameId);
  if (allowed.length > 1) return `${allowed.length} modos en juego`;
  const only = allowed[0];
  return only && only !== 'CLASSIC' ? gameModeName(gameId, only) : null;
}

/**
 * «Invitar amigos» del lobby (solo cuentas registradas, dentro de `FriendsProvider`): abre el panel «Amigos», donde cada
 * amigo conectado que no está en la sala muestra «Invitar». La insignia cuenta los que se pueden invitar ahora.
 */
function LobbyInviteButton({ room }: { room: RoomView }) {
  const friends = useOptionalFriends();
  if (!friends?.enabled) return null;
  const invitable = (friends.overview?.friends ?? []).filter((friend) => canInviteFriend(room, friend)).length;
  return (
    <Pill variant="blue" icon={UserPlus} block aria-haspopup="dialog" {...(invitable > 0 ? { badge: String(Math.min(invitable, 99)) } : {})}
      aria-label={invitable === 0 ? 'Invitar amigos' : `Invitar amigos, ${invitable} ${invitable === 1 ? 'conectado' : 'conectados'}`} onClick={friends.openDrawer}>
      Invitar amigos
    </Pill>
  );
}
