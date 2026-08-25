import { hasRoomPermission, type GameSelectionMode, type RoomView, type SessionMode } from '@pokemon-universe/shared';
import { Check, Copy, LockKeyhole, LogOut, Play, Settings2, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { clientGameRegistry } from '../games/registry';
import { GameSelectionConfig } from './GameSelectionConfig';
import { PlayerList } from './PlayerList';

interface Props {
  room: RoomView;
  selfId: string;
  onLeave(): void;
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

export function Lobby({ room, selfId, onLeave, onStart, onSelectGame, onConfig, onSession, onGameSelection, onSetRoomRole, onTransferHost, onKick, onEndSession }: Props) {
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
  const enoughPlayers = connectedPlayers >= selectedManifest.minPlayers;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const report = (caught: unknown) => setError(caught instanceof Error ? caught.message : 'Ha ocurrido un error.');
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

  const randomPlayable = room.gameSelectionMode.type === 'RANDOM' && room.gameSelectionMode.gameIds.some((gameId) => {
    const manifest = room.availableGames.find((game) => game.id === gameId);
    return Boolean(manifest && connectedPlayers >= manifest.minPlayers && (!manifest.maxPlayers || connectedPlayers <= manifest.maxPlayers));
  });
  const startReason = !canStart
    ? 'Solo el host puede iniciar la partida.'
    : room.gameSelectionMode.type === 'RANDOM' && !randomPlayable
      ? 'Ningún minijuego aleatorio admite el número actual de jugadores.'
    : room.gameSelectionMode.type !== 'RANDOM' && !enoughPlayers
      ? `Se necesitan al menos ${selectedManifest.minPlayers} jugadores conectados.`
      : room.gameSelectionMode.type !== 'RANDOM' && selectedManifest.maxPlayers && connectedPlayers > selectedManifest.maxPlayers
        ? `Este juego admite un máximo de ${selectedManifest.maxPlayers} jugadores.`
        : room.gameSelectionMode.type === 'RANDOM' ? null : gameClient.validateConfig?.(room.selectedGameConfig) ?? null;

  return (
    <section className="page-shell max-w-[92rem]">
      <header className="panel mb-5 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-center justify-between gap-4 sm:justify-start">
          <div>
            <span className="label !mb-0">Código de sala</span>
            <button className="group flex min-h-11 items-center gap-2 text-left font-display text-3xl font-bold tracking-[.14em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua sm:text-4xl" onClick={copyCode} aria-label={`Copiar código de sala ${room.code}`}>
              {room.code}
              {copied ? <Check size={21} className="shrink-0 text-leaf" /> : <Copy size={20} className="shrink-0 text-ink/50 transition group-hover:text-aqua" />}
            </button>
            <span className="block h-4 text-xs font-extrabold text-leaf" aria-live="polite">{copied ? 'Copiado ✓' : ''}</span>
          </div>
          <span className="chip shrink-0 sm:hidden">{connectedPlayers} conectados</span>
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 sm:mt-0 sm:justify-end">
          <div className="hidden text-right lg:block"><p className="font-extrabold">{connectedPlayers} jugador{connectedPlayers === 1 ? '' : 'es'} conectado{connectedPlayers === 1 ? '' : 's'}</p></div>
          <button className="btn-ghost" onClick={onLeave}><LogOut size={18} /> Salir</button>
          <div className="min-w-40 text-right">
            <button className="btn-primary w-full" disabled={Boolean(startReason)} onClick={() => void onStart().catch(report)} aria-describedby="start-help"><Play size={18} fill="currentColor" /> Empezar</button>
            <p id="start-help" className={`mt-2 text-xs font-bold ${startReason ? 'text-berry' : 'text-leaf'}`}>{startReason ?? 'La sala está lista.'}</p>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="card !p-4 xl:sticky xl:top-20">
          <div className="mb-4 flex items-center justify-between">
            <div><span className="label !mb-0">Sala</span><h2 className="font-display text-2xl font-bold">Entrenadores</h2></div>
            <span className="chip"><UsersRound className="mr-1.5" size={15} /> {room.members.length} / {room.maxPlayers}</span>
          </div>
          <PlayerList
            members={room.members}
            selfId={selfId}
            canManage={canManageRoles}
            onSetRoomRole={(id, role) => void onSetRoomRole(id, role).catch(report)}
            onTransferHost={transferHost}
            onKick={kick}
          />
        </aside>

        <main className="min-w-0 space-y-5">
          <article className="card !p-4 md:!p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><span className="step-number">1</span><div><span className="label !mb-0">Elegir juego</span><h2 className="truncate font-display text-2xl font-bold">Minijuegos</h2></div></div>
              {!canChangeGame && <span className="permission-chip"><LockKeyhole size={14} /> Solo lectura</span>}
            </div>
            <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${!canChangeGame ? 'lobby-readonly' : ''}`} aria-describedby={!canChangeGame ? 'game-permission-help' : undefined}>
              {room.availableGames.map((game) => {
                const selected = game.id === room.selectedGameId;
                clientGameRegistry.get(game.id);
                return (
                  <button key={game.id} type="button" disabled={!canChangeGame} aria-pressed={selected} onClick={() => selectGame(game.id)} className={`group min-h-28 rounded-xl border p-3.5 text-left transition-colors ${selected ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised hover:border-aqua/55 hover:bg-ink/[.05]'}`}>
                    <span className="mb-2 flex items-start justify-between gap-2"><span className="text-2xl" aria-hidden="true">{game.icon}</span>{selected && <span className="rounded-full bg-aqua px-2 py-1 text-[.68rem] font-extrabold uppercase tracking-wide text-night">Activo</span>}</span>
                    <strong className="block font-display text-lg">{game.name}</strong>
                    <span className="mt-1 block text-sm font-bold leading-snug text-ink/65">{game.description}</span>
                  </button>
                );
              })}
            </div>
            {!canChangeGame && <p id="game-permission-help" className="permission-help">Solo el host y los co-hosts pueden cambiar el minijuego.</p>}
          </article>

          <article className="card !p-4 md:!p-6">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-ink/10 pb-5">
              <div className="flex min-w-0 items-center gap-3"><span className="step-number">2</span><div><span className="label !mb-0">Configurar juego</span><h2 className="font-display text-2xl font-bold">{selectedManifest.name}</h2><p className="mt-1 font-semibold text-ink/65">{selectedManifest.description}</p></div></div>
              <div className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-aqua/15 text-aqua sm:grid"><Settings2 size={20} /></div>
            </div>
            {!canEditGame && <div className="mb-4 flex items-center gap-2 rounded-xl border border-electric/20 bg-electric/5 px-3 py-2 text-sm font-bold text-ink/60"><LockKeyhole size={15} className="text-electric" /> Solo el host y los co-hosts pueden cambiar esta configuración.</div>}
            <div className={!canEditGame ? 'lobby-readonly' : ''} title={!canEditGame ? 'Solo el host y los co-hosts pueden cambiar esta configuración.' : undefined}>
              <gameClient.ConfigPanel config={room.selectedGameConfig} disabled={!canEditGame} onChange={onConfig} />
            </div>
          </article>

          <article className="card !p-4 md:!p-6">
            <div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="step-number">3</span><div><span className="label !mb-0">Rotación de juegos</span><h2 className="font-display text-2xl font-bold">Cómo se elige cada minijuego</h2></div></div>{!canEditGameSelection && <span className="permission-chip"><LockKeyhole size={14} /> Solo lectura</span>}</div>
            <div className={!canEditGameSelection ? 'lobby-readonly' : ''}>
              <GameSelectionConfig availableGames={room.availableGames} mode={room.gameSelectionMode} disabled={!canEditGameSelection} onChange={gameSelection} />
            </div>
            {!canEditGameSelection && <p className="permission-help">Solo el host y los co-hosts pueden cambiar la rotación.</p>}
          </article>

          <article className="card !p-4 md:!p-6">
            <div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="step-number">4</span><div><span className="label !mb-0">Formato de sesión</span><h2 className="font-display text-2xl font-bold">Cómo se decide el ganador</h2></div></div>{!canEditSession && <span className="permission-chip"><LockKeyhole size={14} /> Solo lectura</span>}</div>
            <div className={`grid gap-3 sm:grid-cols-3 ${!canEditSession ? 'lobby-readonly' : ''}`}>
              <button disabled={!canEditSession} aria-pressed={room.sessionMode.type === 'INFINITE'} className={`session-card ${room.sessionMode.type === 'INFINITE' ? 'session-card-selected' : ''}`} onClick={() => session({ type: 'INFINITE' })}><strong>∞ Infinito</strong><span>Hasta que el host pare</span></button>
              <button disabled={!canEditSession} aria-pressed={room.sessionMode.type === 'GAME_COUNT'} className={`session-card ${room.sessionMode.type === 'GAME_COUNT' ? 'session-card-selected' : ''}`} onClick={() => session({ type: 'GAME_COUNT', target: room.sessionMode.type === 'GAME_COUNT' ? room.sessionMode.target : 5 })}><strong>{room.sessionMode.type === 'GAME_COUNT' ? `${room.sessionMode.target} partidas` : 'Por partidas'}</strong><span>Gana por puntuación</span></button>
              <button disabled={!canEditSession} aria-pressed={room.sessionMode.type === 'POINT_TARGET'} className={`session-card ${room.sessionMode.type === 'POINT_TARGET' ? 'session-card-selected' : ''}`} onClick={() => session({ type: 'POINT_TARGET', target: room.sessionMode.type === 'POINT_TARGET' ? room.sessionMode.target : 50 })}><strong>{room.sessionMode.type === 'POINT_TARGET' ? `${room.sessionMode.target} puntos` : 'Por puntos'}</strong><span>Primero en llegar</span></button>
            </div>
            {room.sessionMode.type === 'GAME_COUNT' && <label className="mt-4 block max-w-xs"><span className="label">Número de partidas</span><input type="number" className="field" min={1} max={100} disabled={!canEditSession} value={room.sessionMode.target} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 1 && target <= 100) session({ type: 'GAME_COUNT', target }); }} /></label>}
            {room.sessionMode.type === 'POINT_TARGET' && <label className="mt-4 block max-w-xs"><span className="label">Puntos para ganar</span><input type="number" className="field" min={5} max={10000} step={5} disabled={!canEditSession} value={room.sessionMode.target} onChange={(event) => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 5 && target <= 10000) session({ type: 'POINT_TARGET', target }); }} /></label>}
            {!canEditSession && <p className="permission-help">Solo el host y los co-hosts pueden cambiar el formato.</p>}
            {hasRoomPermission(roomRole, 'END_SESSION') && room.gamesPlayed > 0 && <button className="mt-4 text-sm font-extrabold text-berry underline" onClick={onEndSession}>Finalizar sesión y ver clasificación</button>}
          </article>
        </main>
      </div>
      {error && <p role="alert" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-berry px-5 py-3 font-bold text-white shadow-card">{error}</p>}
    </section>
  );
}
