import type { RoomView, SessionMode } from '@pokemon-universe/shared';
import { Check, Copy, LogOut, Play, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { PlayerList } from './PlayerList';
import { clientGameRegistry } from '../games/registry';

interface Props {
  room: RoomView; selfId: string; onLeave(): void; onStart(): Promise<void>;
  onSelectGame(gameId: string): Promise<void>; onConfig(config: unknown): Promise<void>;
  onSession(mode: SessionMode): Promise<void>; onKick(id: string): void; onEndSession(): void;
}

export function Lobby({ room, selfId, onLeave, onStart, onSelectGame, onConfig, onSession, onKick, onEndSession }: Props) {
  const host = room.hostId === selfId; const gameClient = clientGameRegistry.get(room.selectedGameId);
  const [copied, setCopied] = useState(false); const [error, setError] = useState('');
  function session(mode: SessionMode) { void onSession(mode).catch((caught) => setError(caught instanceof Error ? caught.message : 'Error')); }
  function selectGame(gameId: string) {
    if (!host || gameId === room.selectedGameId) return;
    void onSelectGame(gameId).catch((caught) => setError(caught instanceof Error ? caught.message : 'Error'));
  }
  return <section className="mx-auto max-w-7xl px-5 py-7 md:px-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><span className="label">Código de sala</span><button className="flex items-center gap-3 font-display text-4xl font-bold tracking-[.15em]" onClick={() => void navigator.clipboard.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{room.code}{copied ? <Check className="text-leaf" /> : <Copy className="text-ink/30" />}</button></div>
      <div className="flex gap-2"><button className="btn-ghost" onClick={onLeave}><LogOut size={18} /> Salir</button>{host && <button className="btn-primary" onClick={() => void onStart().catch((caught) => setError(caught instanceof Error ? caught.message : 'Error'))}><Play size={18} fill="currentColor" /> Empezar</button>}</div>
    </div>
    <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <aside className="card"><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Entrenadores</h2><span className="chip">{room.members.length} / {room.maxPlayers}</span></div><PlayerList room={room} selfId={selfId} canKick={host} onKick={onKick} /><p className="mt-4 text-sm font-bold text-ink/45">Si el host pierde la conexión, conserva su rol durante 30 s. Después pasa al jugador conectado más antiguo.</p></aside>
      <div className="space-y-6">
        <article className="card">
          <div className="mb-4 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-aqua text-night"><Settings2 /></div><div><span className="label !mb-0">Seleccionar minijuego</span><h2 className="font-display text-2xl font-bold">Pokémon Minigame Hub</h2></div></div>
          <div className="mb-7 grid gap-3 sm:grid-cols-2">{room.availableGames.map((game) => {
            const selected = game.id === room.selectedGameId;
            return <button key={game.id} type="button" disabled={!host} aria-pressed={selected} onClick={() => selectGame(game.id)} className={`min-h-36 rounded-2xl border-2 p-4 text-left transition ${selected ? 'border-electric bg-electric text-night shadow-[0_0_0_3px_rgba(240,191,84,.16)]' : 'border-ink/10 bg-surface-raised hover:border-aqua'} ${!host ? 'cursor-default' : ''}`}>
              <span className="mb-3 block text-3xl" aria-hidden="true">{game.id === 'pokedex-distance' ? '🎯' : '✨'}</span>
              <strong className="block font-display text-xl">{game.name}</strong>
              <span className={`mt-1 block text-sm font-bold ${selected ? 'text-night/65' : 'text-ink/50'}`}>{game.description}</span>
              {selected && <span className="mt-3 inline-flex rounded-full bg-night px-2 py-1 text-xs font-extrabold text-ink">Seleccionado</span>}
            </button>;
          })}</div>
          <div className="mb-5"><span className="label !mb-0">Configuración de {gameClient.name}</span><p className="font-semibold text-ink/55">{gameClient.description}</p></div>
          <gameClient.ConfigPanel config={room.selectedGameConfig} disabled={!host} onChange={onConfig} />
        </article>
        <article className="card"><span className="label">Formato de sesión</span><div className="grid gap-3 sm:grid-cols-3"><button disabled={!host} className={`rounded-2xl border-2 p-4 text-left ${room.sessionMode.type === 'INFINITE' ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`} onClick={() => session({ type: 'INFINITE' })}><strong className="block font-display text-lg">∞ Infinito</strong><span className="text-sm font-bold opacity-60">Hasta que el host pare</span></button><button disabled={!host} className={`rounded-2xl border-2 p-4 text-left ${room.sessionMode.type === 'GAME_COUNT' ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised'}`} onClick={() => session({ type: 'GAME_COUNT', target: 5 })}><strong className="block font-display text-lg">5 partidas</strong><span className="text-sm font-bold opacity-60">Gana por puntos</span></button><button disabled={!host} className={`rounded-2xl border-2 p-4 text-left ${room.sessionMode.type === 'POINT_TARGET' ? 'border-berry bg-berry text-night' : 'border-ink/10 bg-surface-raised'}`} onClick={() => session({ type: 'POINT_TARGET', target: 50 })}><strong className="block font-display text-lg">50 puntos</strong><span className="text-sm font-bold opacity-60">Primero en llegar</span></button></div>{host && room.gamesPlayed > 0 && <button className="mt-4 text-sm font-extrabold text-berry underline" onClick={onEndSession}>Finalizar sesión y ver clasificación</button>}</article>
      </div>
    </div>{error && <p className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-xl bg-berry px-5 py-3 font-bold text-white shadow-card">{error}</p>}
  </section>;
}
