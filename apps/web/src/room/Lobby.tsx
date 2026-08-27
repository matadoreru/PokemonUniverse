import { formatPendingReadyNames, hasRoomPermission, supportsPlayerCount, type GameSelectionMode, type RoomView, type SessionMode } from '@pokemon-universe/shared';
import { Check, CheckCircle2, ChevronDown, Copy, Gamepad2, LockKeyhole, LogOut, Play, Search, Settings2, SlidersHorizontal, UsersRound, WifiOff } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { GameLoadingFallback } from '../components/LoadingFallback';
import { clientGameRegistry } from '../games/registry';
import { GameSelectionConfig } from './GameSelectionConfig';
import { PlayerList } from './PlayerList';

interface Props {
  room: RoomView;
  selfId: string;
  onLeave(): void;
  onReady(ready: boolean): Promise<void>;
  onStart(): Promise<void>;
  onSelectGame(gameId: string): Promise<void>;
  onConfig(config: unknown): Promise<void>;
  onSession(mode: SessionMode): Promise<void>;
  onGameSelection(mode: GameSelectionMode): Promise<void>;
  onSetRoomRole(playerId: string, role: 'CO_HOST' | 'MEMBER'): Promise<void>;
  onTransferHost(playerId: string): Promise<void>;
  onKick(playerId: string): Promise<void>;
  onEndSession(): void;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
}

export function Lobby({ room, selfId, onLeave, onReady, onStart, onSelectGame, onConfig, onSession, onGameSelection, onSetRoomRole, onTransferHost, onKick, onEndSession }: Props) {
  const self = room.members.find((member) => member.id === selfId);
  const roomRole = self?.roomRole ?? 'MEMBER';
  const canEditGame = hasRoomPermission(roomRole, 'EDIT_GAME_CONFIG');
  const canChangeGame = hasRoomPermission(roomRole, 'CHANGE_GAME');
  const canEditSession = hasRoomPermission(roomRole, 'EDIT_SESSION');
  const canEditGameSelection = hasRoomPermission(roomRole, 'EDIT_GAME_SELECTION');
  const canStart = hasRoomPermission(roomRole, 'START_GAME');
  const canManageRoles = hasRoomPermission(roomRole, 'MANAGE_ROLES');
  const gameClient = clientGameRegistry.get(room.selectedGameId);
  const selectedManifest = room.availableGames.find((game) => game.id === room.selectedGameId)!;
  const connectedPlayers = room.members.filter((member) => member.presence === 'CONNECTED').length;
  const pendingReady = room.members.filter((member) => member.presence === 'CONNECTED' && member.id !== room.hostId && !member.ready);
  const hostMember = room.members.find((member) => member.id === room.hostId);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [readyBusy, setReadyBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameQuery, setGameQuery] = useState('');
  const [sessionExpanded, setSessionExpanded] = useState(
    room.gameSelectionMode.type !== 'FIXED' || room.sessionMode.type !== 'INFINITE' || room.gamesPlayed > 0,
  );

  useEffect(() => {
    const preloadTimer = window.setTimeout(() => { void gameClient.preloadGameplay().catch(() => undefined); }, 600);
    return () => window.clearTimeout(preloadTimer);
  }, [gameClient]);

  const report = (caught: unknown) => setError(caught instanceof Error ? caught.message : 'Ha ocurrido un error.');
  const toggleReady = async () => {
    if (!self || self.roomRole === 'HOST' || readyBusy) return;
    setReadyBusy(true); setError('');
    try { await onReady(!self.ready); } catch (caught) { report(caught); }
    finally { setReadyBusy(false); }
  };
  const start = async () => {
    if (starting) return;
    setStarting(true); setError('');
    try { await onStart(); } catch (caught) { report(caught); setStarting(false); }
  };
  const session = (mode: SessionMode) => { if (canEditSession) void onSession(mode).catch(report); };
  const gameSelection = (mode: GameSelectionMode) => { if (canEditGameSelection) void onGameSelection(mode).catch(report); };
  const selectGame = (gameId: string) => {
    if (!canChangeGame || gameId === room.selectedGameId) return;
    void onSelectGame(gameId).catch(report);
  };
  const copyCode = () => void navigator.clipboard.writeText(room.code).then(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }).catch(report);
  const transferHost = (playerId: string) => {
    const target = room.members.find((member) => member.id === playerId);
    if (!target || !window.confirm(`¿Transferir el Host a ${target.displayName}?\n\nTú pasarás a ser Co-host.`)) return;
    void onTransferHost(playerId).catch(report);
  };
  const kick = (playerId: string) => {
    const target = room.members.find((member) => member.id === playerId);
    if (!target || !window.confirm(`¿Expulsar a ${target.displayName} de la sala?`)) return;
    void onKick(playerId).catch(report);
  };

  const rotationPlayableCount = room.gameSelectionMode.type !== 'FIXED' ? room.gameSelectionMode.gameIds.filter((gameId) => {
    const manifest = room.availableGames.find((game) => game.id === gameId);
    return Boolean(manifest && supportsPlayerCount(manifest, connectedPlayers));
  }).length : 0;
  const selectedGameReason = connectedPlayers < selectedManifest.minPlayers
    ? `Se necesitan al menos ${selectedManifest.minPlayers} jugadores conectados.`
    : selectedManifest.maxPlayers !== undefined && connectedPlayers > selectedManifest.maxPlayers
      ? `Este juego admite un máximo de ${selectedManifest.maxPlayers} jugadores.`
      : null;
  const startReason = !canStart
    ? 'Solo el host puede iniciar la partida.'
    : pendingReady.length > 0
      ? `Falta por confirmar: ${formatPendingReadyNames(pendingReady.map((member) => member.displayName))}.`
    : room.gameSelectionMode.type === 'RANDOM' && rotationPlayableCount < 2
      ? 'La rotación aleatoria necesita al menos 2 minijuegos compatibles.'
    : room.gameSelectionMode.type === 'VOTE' && rotationPlayableCount < 3
      ? 'La votación necesita al menos 3 minijuegos compatibles.'
      : room.gameSelectionMode.type !== 'RANDOM' && selectedGameReason
        ? selectedGameReason
      : room.gameSelectionMode.type === 'RANDOM' ? null : gameClient.validateConfig?.(room.selectedGameConfig, room) ?? null;

  const normalizedQuery = normalizeSearch(gameQuery);
  const visibleGames = normalizedQuery
    ? room.availableGames.filter((game) => normalizeSearch(`${game.name} ${game.description}`).includes(normalizedQuery))
    : room.availableGames;
  const playerRange = selectedManifest.maxPlayers === undefined
    ? `${selectedManifest.minPlayers}+ jugadores`
    : `${selectedManifest.minPlayers}–${selectedManifest.maxPlayers} jugadores`;

  return (
    <section className="page-shell max-w-[90rem]">
      <header className="panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-ink/65">Prepara la partida</p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Lobby de la sala</h1>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <button className="group inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-left hover:bg-ink/[.05]" onClick={copyCode} aria-label={`Copiar código de sala ${room.code}`}>
            <span><span className="block text-xs font-extrabold text-ink/60">Código</span><strong className="block font-display text-xl tracking-[.12em] sm:text-2xl">{room.code}</strong></span>
            {copied ? <Check size={19} className="shrink-0 text-leaf" /> : <Copy size={18} className="shrink-0 text-ink/50 transition-colors group-hover:text-aqua" />}
          </button>
          <span className="sr-only" aria-live="polite">{copied ? 'Código copiado' : ''}</span>
          <button className="btn-ghost px-3 sm:px-4" onClick={onLeave}><LogOut size={18} /><span className="hidden sm:inline">Salir</span></button>
        </div>
      </header>

      {hostMember?.presence === 'TEMPORARILY_DISCONNECTED' && <div className="mb-4 flex items-start gap-3 rounded-xl border border-electric/30 bg-electric/10 px-4 py-3 font-bold" role="status" aria-live="polite"><WifiOff className="mt-0.5 shrink-0 text-electric" size={19} /><span><strong className="block">El host está reconectando.</strong><span className="text-sm text-ink/65">La sala conserva la configuración y esperará antes de transferir el control.</span></span></div>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <main className="min-w-0 space-y-4">
          <article className="panel overflow-hidden">
            <section className="p-4 sm:p-5" aria-labelledby="lobby-game-heading">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><span className="step-number">1</span><div><span className="label !mb-0">Selección de juego</span><h2 id="lobby-game-heading" className="font-display text-2xl font-bold">Elige un minijuego</h2></div></div>
                {!canChangeGame && <span className="permission-chip"><LockKeyhole size={14} /> Solo lectura</span>}
              </div>

              <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,.7fr)] sm:items-center">
                <div className="flex min-w-0 items-center gap-3 rounded-xl bg-aqua/[.08] px-3 py-2.5">
                  <span className="text-2xl" aria-hidden="true">{selectedManifest.icon}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate font-display text-lg">{selectedManifest.name}</strong><span className="block truncate text-sm font-bold text-ink/65">{selectedManifest.description}</span></span>
                  <span className="hidden shrink-0 text-xs font-extrabold text-aqua xl:inline">{playerRange}</span>
                </div>
                <label className="relative block"><span className="sr-only">Buscar minijuego</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" size={18} /><input className="field !pl-10" type="search" value={gameQuery} onChange={(event) => setGameQuery(event.target.value)} placeholder={`Buscar entre ${room.availableGames.length} juegos`} /></label>
              </div>

              <div className={`lobby-game-grid ${!canChangeGame ? 'lobby-readonly' : ''}`} aria-describedby={!canChangeGame ? 'game-permission-help' : undefined}>
                {visibleGames.map((game) => {
                  const selected = game.id === room.selectedGameId;
                  const candidate = clientGameRegistry.get(game.id);
                  const preloadConfig = () => { void candidate.preloadConfig().catch(() => undefined); };
                  return <button key={game.id} type="button" disabled={!canChangeGame} aria-pressed={selected} onClick={() => selectGame(game.id)} onPointerEnter={preloadConfig} onFocus={preloadConfig} className={`lobby-game-option ${selected ? 'lobby-game-option-selected' : ''}`}>
                    <span className="text-xl" aria-hidden="true">{game.icon}</span><span className="min-w-0 flex-1"><strong className="block truncate">{game.name}</strong><small className="block text-xs font-bold text-ink/55">{game.minPlayers}{game.maxPlayers ? `–${game.maxPlayers}` : '+'} jugadores</small></span>{selected && <CheckCircle2 className="shrink-0 text-aqua" size={18} aria-label="Seleccionado" />}
                  </button>;
                })}
                {visibleGames.length === 0 && <div className="empty-state col-span-full !p-4"><Gamepad2 className="mx-auto mb-1 text-ink/45" size={22} /><p className="font-bold">No hay minijuegos que coincidan con “{gameQuery.trim()}”.</p></div>}
              </div>
              {!canChangeGame && <p id="game-permission-help" className="permission-help">Solo el host y los co-hosts pueden cambiar el minijuego.</p>}
            </section>

            <section className="border-t border-ink/10 p-4 sm:p-5" aria-labelledby="lobby-config-heading">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><span className="step-number">2</span><div><span className="label !mb-0">Configuración del juego</span><h2 id="lobby-config-heading" className="font-display text-2xl font-bold">Ajustes de {selectedManifest.name}</h2></div></div>
                <Settings2 className="mt-1 hidden shrink-0 text-aqua sm:block" size={21} />
              </div>
              {!canEditGame && <div className="mb-4 flex items-center gap-2 rounded-xl bg-electric/[.07] px-3 py-2 text-sm font-bold text-ink/65"><LockKeyhole size={15} className="text-electric" /> Solo el host y los co-hosts pueden cambiar estos ajustes.</div>}
              <div className={!canEditGame ? 'lobby-readonly' : ''} title={!canEditGame ? 'Solo el host y los co-hosts pueden cambiar esta configuración.' : undefined}>
                <Suspense fallback={<GameLoadingFallback compact />}><gameClient.ConfigPanel config={room.selectedGameConfig} disabled={!canEditGame} room={room} selfId={selfId} onChange={onConfig} /></Suspense>
              </div>
            </section>
          </article>

          <section className="panel" aria-labelledby="session-settings-heading">
            <button type="button" className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left sm:px-5" aria-expanded={sessionExpanded} aria-controls="session-settings-content" onClick={() => setSessionExpanded((expanded) => !expanded)}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink/[.07] text-aqua"><SlidersHorizontal size={19} /></span>
              <span className="min-w-0 flex-1"><strong id="session-settings-heading" className="block font-display text-lg">Ajustes de sesión</strong><span className="block truncate text-sm font-bold text-ink/60">Rotación {room.gameSelectionMode.type === 'FIXED' ? 'fija' : room.gameSelectionMode.type === 'RANDOM' ? 'aleatoria' : 'por votación'} · {room.sessionMode.type === 'INFINITE' ? 'sin límite' : room.sessionMode.type === 'GAME_COUNT' ? `${room.sessionMode.target} partidas` : `${room.sessionMode.target} puntos`}</span></span>
              <ChevronDown className={`shrink-0 text-ink/55 transition-transform duration-200 ${sessionExpanded ? 'rotate-180' : ''}`} size={20} />
            </button>
            <div id="session-settings-content" hidden={!sessionExpanded} className="border-t border-ink/10 p-4 sm:p-5">
              <section aria-labelledby="rotation-heading">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 id="rotation-heading" className="font-display text-lg font-bold">Rotación de minijuegos</h3><p className="text-sm font-bold text-ink/60">Decide qué ocurre al terminar cada partida.</p></div>{!canEditGameSelection && <span className="permission-chip"><LockKeyhole size={14} /> Solo lectura</span>}</div>
                <div className={!canEditGameSelection ? 'lobby-readonly' : ''}><GameSelectionConfig availableGames={room.availableGames} mode={room.gameSelectionMode} playerCount={connectedPlayers} disabled={!canEditGameSelection} onChange={gameSelection} /></div>
              </section>
              <section className="mt-6 border-t border-ink/10 pt-5" aria-labelledby="format-heading">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 id="format-heading" className="font-display text-lg font-bold">Final de la sesión</h3><p className="text-sm font-bold text-ink/60">Elige cuándo se decide la clasificación final.</p></div>{!canEditSession && <span className="permission-chip"><LockKeyhole size={14} /> Solo lectura</span>}</div>
                <div className={`grid gap-2 sm:grid-cols-3 ${!canEditSession ? 'lobby-readonly' : ''}`}>
                  <button disabled={!canEditSession} aria-pressed={room.sessionMode.type === 'INFINITE'} className={`session-card ${room.sessionMode.type === 'INFINITE' ? 'session-card-selected' : ''}`} onClick={() => session({ type: 'INFINITE' })}><strong>∞ Infinita</strong><span>Hasta que el host pare</span></button>
                  <button disabled={!canEditSession} aria-pressed={room.sessionMode.type === 'GAME_COUNT'} className={`session-card ${room.sessionMode.type === 'GAME_COUNT' ? 'session-card-selected' : ''}`} onClick={() => session({ type: 'GAME_COUNT', target: room.sessionMode.type === 'GAME_COUNT' ? room.sessionMode.target : 5 })}><strong>{room.sessionMode.type === 'GAME_COUNT' ? `${room.sessionMode.target} partidas` : 'Por partidas'}</strong><span>Gana por puntuación</span></button>
                  <button disabled={!canEditSession} aria-pressed={room.sessionMode.type === 'POINT_TARGET'} className={`session-card ${room.sessionMode.type === 'POINT_TARGET' ? 'session-card-selected' : ''}`} onClick={() => session({ type: 'POINT_TARGET', target: room.sessionMode.type === 'POINT_TARGET' ? room.sessionMode.target : 50 })}><strong>{room.sessionMode.type === 'POINT_TARGET' ? `${room.sessionMode.target} puntos` : 'Por puntos'}</strong><span>Primero en llegar</span></button>
                </div>
                {room.sessionMode.type === 'GAME_COUNT' && <label className="mt-3 block max-w-xs"><span className="label">Número de partidas</span><input type="number" className="field" min={1} max={100} disabled={!canEditSession} value={room.sessionMode.target} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 1 && target <= 100) session({ type: 'GAME_COUNT', target }); }} /></label>}
                {room.sessionMode.type === 'POINT_TARGET' && <label className="mt-3 block max-w-xs"><span className="label">Puntos para ganar</span><input type="number" className="field" min={5} max={10000} step={5} disabled={!canEditSession} value={room.sessionMode.target} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 5 && target <= 10000) session({ type: 'POINT_TARGET', target }); }} /></label>}
                {hasRoomPermission(roomRole, 'END_SESSION') && room.gamesPlayed > 0 && <button className="mt-4 text-sm font-extrabold text-berry underline" onClick={onEndSession}>Finalizar sesión y ver clasificación</button>}
              </section>
            </div>
          </section>
        </main>

        <aside className="card !p-4 lg:sticky lg:top-20">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><span className="step-number">3</span><div><span className="label !mb-0">Sala</span><h2 className="font-display text-xl font-bold">Jugadores</h2></div></div>
            <span className="chip"><UsersRound className="mr-1.5" size={15} /> {connectedPlayers} / {room.maxPlayers}</span>
          </div>
          <PlayerList members={room.members} selfId={selfId} canManage={canManageRoles} onSetRoomRole={(id, role) => void onSetRoomRole(id, role).catch(report)} onTransferHost={transferHost} onKick={kick} />

          <div className="mt-4 border-t border-ink/10 pt-4">
            <div className="mb-3 flex items-center gap-3"><span className="step-number">4</span><div><span className="label !mb-0">Todo listo</span><h2 className="font-display text-xl font-bold">Iniciar partida</h2></div></div>
            {self?.roomRole !== 'HOST' && <button type="button" className={`mb-2 w-full ${self?.ready ? 'btn-ghost border-leaf/40 text-leaf' : 'btn-secondary'}`} disabled={readyBusy || self?.presence !== 'CONNECTED'} aria-pressed={Boolean(self?.ready)} onClick={() => void toggleReady()}><CheckCircle2 size={18} /> {readyBusy ? 'Guardando…' : self?.ready ? 'Estoy listo' : 'Marcarme listo'}</button>}
            <button className="btn-primary w-full" disabled={Boolean(startReason) || starting} onClick={() => void start()} aria-describedby="start-help"><Play size={18} fill="currentColor" /> {starting ? 'Iniciando…' : 'Empezar partida'}</button>
            <p id="start-help" className={`mt-2 text-sm font-bold ${startReason ? 'text-berry' : 'text-leaf'}`}>{startReason ?? 'La sala está lista.'}</p>
          </div>
        </aside>
      </div>
      {error && <p role="alert" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-berry px-5 py-3 font-bold text-white shadow-card">{error}</p>}
    </section>
  );
}
