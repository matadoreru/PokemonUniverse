import { gameModeCount, gameModeName, hasRoomPermission, type ChatMessage, type GameSelectionMode, type RoomView, type SessionMode } from '@pokemon-universe/shared/public';
import { Check, CheckCircle2, UserPlus, Flag, Flame, Gamepad2, Hash, Infinity as InfinityIcon, LockKeyhole, MessageCircle, Play, Search, Settings2, Shuffle, Trophy, Users, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalFriends } from '../friends/FriendsContext';
import { canInviteFriend } from '../friends/FriendsDrawer';
import { clientGameRegistry } from '../games/registry';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Badge, Card, Chip, cx, Field, Icon, Panel, Pill, StateBox, TabPanel, Tabs, Toggle, type TabItem } from '../ui';
import { GameArt } from '../games/GameArt';
import { ChatAnnouncer } from './chat/chat-announcer';
import { LobbyChat } from './chat/LobbyChat';
import { allowedModesOf, compatibleSelectedGameIds, GameOrderChoice, GameOrderHint, queueSlotLabel, queueSlots, queueSlotSpoken, rotationGameConfig, SelectedGamesConfig, toggleSelectedGame } from './GameSelectionConfig';
import { connectedCount, filterGames, lobbyActionStatus, lobbyStartReason, playerRangeLabel, withDoubleLastGame, withGameCountTarget } from './lobby-state';
import { RoomPlayersPanel } from './RoomPlayersPanel';
import { SessionScreen } from './SessionScreen';
import { ignoreFailure } from './room-command';
import s from './Lobby.module.css';

interface Props {
  room: RoomView;
  selfId: string;
  onReady(ready: boolean): Promise<void>;
  onStart(): Promise<void>;
  onGameConfig(gameId: string, config: unknown): Promise<void>;
  onSession(mode: SessionMode): Promise<void>;
  onGameSelection(mode: GameSelectionMode): Promise<void>;
  /** Los modos que se juegan de un juego (las tres formas de sesión). Opcional: sin él, el panel enseña el selector «Modo» de un solo modo. */
  onAllowedModes?(gameId: string, modes: string[]): Promise<void>;
  onSetRoomRole(playerId: string, role: 'CO_HOST' | 'MEMBER'): Promise<void>;
  onTransferHost(playerId: string): Promise<void>;
  onKick(playerId: string): Promise<void>;
  onEndSession(): void;
  /** Últimos mensajes del chat de la sala (de `useRoom()`), por `seq`. */
  chat: ChatMessage[];
  /** Sube con cada historial aplicado: el historial nunca se anuncia ni suma no leídos. */
  chatHistoryVersion: number;
  onSendChat(text: string): Promise<void>;
  onDeleteChatMessage(seq: number): Promise<void>;
  onSetChatMute(playerId: string, muted: boolean): Promise<void>;
}

type LobbyTab = 'games' | 'config' | 'session' | 'chat';
const TAB_ID = 'lobby';
// Por debajo de 1024 px (el corte de la pestaña «Chat») se leen las etiquetas cortas, para que quepan las cuatro; el
// nombre accesible sigue siendo el largo.
const BASE_TABS: TabItem<LobbyTab>[] = [
  { key: 'games', label: <><span className="lg:hidden" aria-hidden="true">Juegos</span><span className="max-lg:sr-only">Minijuegos</span></>, icon: Gamepad2 },
  { key: 'config', label: <><span className="lg:hidden" aria-hidden="true">Ajustes</span><span className="max-lg:sr-only">Configuración</span></>, icon: Settings2 },
  { key: 'session', label: <>Modo<span className="max-lg:sr-only"> y sesión</span></>, icon: Shuffle },
];
const HOST_RECONNECTING = 'El host está reconectando. La sala conserva la configuración y esperará antes de transferir el control.';

const maxSeq = (messages: ChatMessage[]) => messages.reduce((max, message) => Math.max(max, message.seq), 0);

export function Lobby({ room, selfId, onReady, onStart, onGameConfig, onSession, onGameSelection, onAllowedModes, onSetRoomRole, onTransferHost, onKick, onEndSession, chat, chatHistoryVersion, onSendChat, onDeleteChatMessage, onSetChatMute }: Props) {
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
  // Un solo chat montado: en la columna lateral desde 1024 px y, por debajo, en su pestaña.
  const wide = useMediaQuery('(min-width: 1024px)');
  const shownTab: LobbyTab = wide && activeTab === 'chat' ? 'games' : activeTab;
  useEffect(() => { if (wide && activeTab === 'chat') setActiveTab('games'); }, [wide, activeTab]);
  const chatVisible = wide || shownTab === 'chat';

  // No leídos: los mensajes de otros con `seq` mayor que el último visto. Al montarse (también al volver de una
  // partida) todo lo que ya hay cuenta como visto, y un historial nuevo también: solo suman los mensajes en vivo.
  const [seen, setSeen] = useState(() => ({ seq: maxSeq(chat), history: chatHistoryVersion }));
  const latestSeq = maxSeq(chat);
  if (seen.history !== chatHistoryVersion || (chatVisible && seen.seq < latestSeq)) {
    setSeen({ seq: Math.max(seen.seq, latestSeq), history: chatHistoryVersion });
  }
  const unread = chatVisible ? 0 : chat.filter((message) => message.authorId !== selfId && message.seq > seen.seq).length;

  // La única región viva del lobby: los mensajes de otros (agrupados) y el aviso del host reconectando.
  // Con su número: dos anuncios iguales seguidos («Ana: hola» dos veces) cambian de nodo y se leen los dos.
  const [chatAnnouncement, setChatAnnouncement] = useState({ id: 0, text: '' });
  const announce = useCallback((text: string) => setChatAnnouncement((previous) => ({ id: previous.id + 1, text })), []);
  const announcer = useRef<ChatAnnouncer | null>(null);
  const announcedHistory = useRef(chatHistoryVersion);
  useEffect(() => {
    const current = (announcer.current ??= new ChatAnnouncer(selfId, announce));
    const fromHistory = announcedHistory.current !== chatHistoryVersion;
    announcedHistory.current = chatHistoryVersion;
    current.seen(chat, fromHistory);
  }, [chat, chatHistoryVersion, selfId, announce]);
  useEffect(() => () => { announcer.current?.dispose(); announcer.current = null; }, []);

  useEffect(() => {
    const preloadTimer = window.setTimeout(() => { void gameClient.preloadGameplay().catch(() => undefined); }, 600);
    return () => window.clearTimeout(preloadTimer);
  }, [gameClient]);

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
  // Las cartas eligen varios juegos: pulsar pone o quita uno (el último elegido va al final; la lista puede quedar vacía).
  const toggleGame = (gameId: string) => gameSelection(toggleSelectedGame(room.gameSelectionMode, gameId));
  // La confirmación (expulsar, transferir el Host) la pide el diálogo de la lista de jugadores.
  const transferHost = (playerId: string) => { void onTransferHost(playerId).catch(ignoreFailure); };
  const kick = (playerId: string) => { void onKick(playerId).catch(ignoreFailure); };
  const setChatMute = (playerId: string, muted: boolean) => { void onSetChatMute(playerId, muted).catch(ignoreFailure); };

  const selectedGameIds = room.gameSelectionMode.gameIds;
  const compatibleGameIds = compatibleSelectedGameIds(room, connectedPlayers);
  // Cada modo marcado es una opción más al azar o por votación y un turno más de la cola por orden.
  const pairCount = compatibleGameIds.reduce((count, gameId) => count + Math.max(1, allowedModesOf(room, gameId).length), 0);
  const slots = queueSlots(room);
  const configReason = (selectedGameIds.length === 1 ? selectedGameIds : compatibleGameIds).map((gameId) => {
    const manifest = room.availableGames.find((game) => game.id === gameId);
    if (!manifest) return null;
    const reason = clientGameRegistry.get(gameId).validateConfig(rotationGameConfig(room, gameId), room);
    return reason ? (selectedGameIds.length === 1 ? reason : `${manifest.name}: ${reason}`) : null;
  }).find((reason) => reason !== null) ?? null;
  const startReason = lobbyStartReason({
    canStart,
    selectedGames: selectedGameIds.map((gameId) => room.availableGames.find((game) => game.id === gameId)),
    compatibleCount: compatibleGameIds.length,
    pendingReadyNames: pendingReady.map((member) => member.displayName),
    connectedPlayers,
    configReason,
  });
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

  const chatPanel = <LobbyChat className={wide ? s.sidePanel ?? '' : ''} messages={chat} members={room.members} selfId={selfId} selfRole={roomRole} onSend={onSendChat} onDelete={onDeleteChatMessage} onSetMute={onSetChatMute} active={chatVisible} />;
  const tabs: TabItem<LobbyTab>[] = wide ? BASE_TABS : [...BASE_TABS, {
    key: 'chat', label: 'Chat', icon: MessageCircle,
    ...(unread > 0 ? { badge: <>{unread > 99 ? '99+' : unread}<span className="sr-only"> sin leer</span></> } : {}),
  }];

  const side = (
    <div className={s.side}>
      <LobbyInviteButton room={room} />
      <RoomPlayersPanel className={s.playersPanel ?? ''} bodyClassName={s.playersBody ?? ''} members={room.members} maxPlayers={room.maxPlayers} selfId={selfId} canManage={canManageRoles} onSetRoomRole={(id, role) => void onSetRoomRole(id, role).catch(ignoreFailure)} onTransferHost={transferHost} onKick={kick} onSetChatMute={setChatMute} />
      {wide && chatPanel}
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
            const slot = slots[game.id];
            const selected = slot !== undefined;
            const preloadConfig = () => { void clientGameRegistry.get(game.id).preloadConfig().catch(() => undefined); };
            const modeLabel = lobbyModeLabel(room, game.id);
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
                  {slot && <><span className={s.tick} aria-hidden="true">{queueSlotLabel(slot)}</span><span className="sr-only">{`, n.º ${queueSlotSpoken(slot)} de la sesión`}</span></>}
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
            { type: 'GAME_COUNT', icon: Hash, name: room.sessionMode.type === 'GAME_COUNT' ? `${room.sessionMode.target} partidas` : 'Por partidas', mode: room.sessionMode.type === 'GAME_COUNT' ? room.sessionMode : { type: 'GAME_COUNT', target: 5 } },
            { type: 'POINT_TARGET', icon: Trophy, name: room.sessionMode.type === 'POINT_TARGET' ? `${room.sessionMode.target} puntos` : 'Por puntos', mode: { type: 'POINT_TARGET', target: room.sessionMode.type === 'POINT_TARGET' ? room.sessionMode.target : 50 } },
          ] satisfies { type: SessionMode['type']; icon: typeof Hash; name: string; mode: SessionMode }[]).map((choice) => (
            <Card key={choice.type} size="sm" art={<Icon icon={choice.icon} size={32} />} name={choice.name} state={room.sessionMode.type === choice.type ? 'selected' : 'idle'} {...(canEditSession ? { onSelect: () => session(choice.mode) } : {})}>
            </Card>
          ))}
        </div>
        {room.sessionMode.type === 'GAME_COUNT' && sessionTarget !== null && <Field className={cx(s.target)} label="Número de partidas" type="number" min={1} max={100} disabled={!canEditSession} value={sessionTarget} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 1 && target <= 100) session(withGameCountTarget(room.sessionMode, target)); }} />}
        {/* Solo en el modo por partidas; la opción la ve y la cambia quien puede editar la sesión, el resto solo si está activa. */}
        {room.sessionMode.type === 'GAME_COUNT' && (canEditSession
          ? <Toggle className={cx(s.doubleLast)} label="La última partida vale doble" hint="Da el doble de puntos de sesión: permite remontar al final." checked={room.sessionMode.doubleLastGame === true} onChange={(doubleLastGame) => { const mode = withDoubleLastGame(room.sessionMode, doubleLastGame); if (mode) session(mode); }} />
          : room.sessionMode.doubleLastGame === true && <p className={s.readonly}><Icon icon={Flame} size={18} />La última partida vale doble.</p>)}
        {room.sessionMode.type === 'POINT_TARGET' && sessionTarget !== null && <Field className={cx(s.target)} label="Puntos para ganar" type="number" min={5} max={10000} step={5} disabled={!canEditSession} value={sessionTarget} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 5 && target <= 10000) session({ type: 'POINT_TARGET', target }); }} />}
        {hasRoomPermission(roomRole, 'END_SESSION') && room.gamesPlayed > 0 && <Pill variant="danger" icon={Flag} className={s.endSession} onClick={onEndSession}>Finalizar sesión y ver clasificación</Pill>}
      </section>
    </>
  );

  const hostReconnecting = hostMember?.presence === 'TEMPORARILY_DISCONNECTED';
  const main = (
    <div className={s.main}>
      {/* El código y «Salir» están en la placa de la sala de la cabecera (RoomPlate); aquí queda el encabezado para el foco de ruta. */}
      <h1 className="sr-only">Lobby de la sala</h1>
      {/* Siempre montada y fuera de los paneles de pestaña: se oye también con la pestaña «Chat» cerrada. */}
      <p className="sr-only" role="status" aria-live="polite"><span>{hostReconnecting ? HOST_RECONNECTING : ''}</span><span key={chatAnnouncement.id}>{chatAnnouncement.text}</span></p>
      {hostReconnecting && (
        <div className={s.notice}>
          <span className={s.noticeBadge}><Icon icon={WifiOff} size={22} /></span>
          <span>
            <strong className={s.noticeTitle}>El host está reconectando.</strong>
            <span className={s.noticeText}>La sala conserva la configuración y esperará antes de transferir el control.</span>
          </span>
        </div>
      )}
      <div className={s.tabbed}>
        <Tabs items={tabs} active={shownTab} onChange={setActiveTab} label="Secciones del lobby" idBase={TAB_ID} className={cx(s.tabs)} />
        {/* Los paneles quedan montados: cambiar de pestaña no pierde búsquedas, ajustes a medio confirmar ni el borrador del chat. */}
        <TabPanel idBase={TAB_ID} tabKey="games" hidden={shownTab !== 'games'} className={cx(s.body)}>{gamesPanel}</TabPanel>
        <TabPanel idBase={TAB_ID} tabKey="config" hidden={shownTab !== 'config'} className={cx(s.body)}>{configPanel}</TabPanel>
        <TabPanel idBase={TAB_ID} tabKey="session" hidden={shownTab !== 'session'} className={cx(s.body)}>{sessionPanel}</TabPanel>
        {!wide && <TabPanel idBase={TAB_ID} tabKey="chat" hidden={shownTab !== 'chat'} className={cx(s.body)}>{chatPanel}</TabPanel>}
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
 * Chip de modo de la carta del lobby (las tres formas de sesión): «N modos en juego» si hay varios marcados o el nombre
 * del único si no es Clásico. `null` sin chip.
 */
export function lobbyModeLabel(room: RoomView, gameId: string): string | null {
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
