import type { HigherLowerCategory, HigherLowerChoice, HigherLowerPlayerState, HigherLowerPokemonView, HigherLowerPublicState, RoomView } from '@pokemon-universe/shared/public';
import { ArrowDown, ArrowUp, Check, Clock3, Equal, Flame, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RevealCutIn } from '../components/RevealCutIn';
import { ScorePop } from '../components/ScorePop';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { apiAsset } from '../lib/api';
import { HigherLowerBars } from './HigherLowerBars';
import { higherLowerChoiceLabels, higherLowerOutcomeLine, higherLowerRevealCountdown, higherLowerStreakMilestone } from './higher-lower-labels';
const categoryLabels: Record<HigherLowerCategory, string> = { DEX_NUMBER: 'N.º Pokédex', HP: 'HP', ATTACK: 'Ataque', DEFENSE: 'Defensa', SPECIAL_ATTACK: 'Ataque Especial', SPECIAL_DEFENSE: 'Defensa Especial', SPEED: 'Velocidad', BASE_STAT_TOTAL: 'Total de stats' };
const choices: Array<{ id: HigherLowerChoice; icon: typeof ArrowUp; tone: string }> = [{ id: 'HIGHER', icon: ArrowUp, tone: 'border-leaf hover:border-leaf hover:bg-leaf/15' }, { id: 'SAME', icon: Equal, tone: 'border-electric hover:border-electric hover:bg-electric/15' }, { id: 'LOWER', icon: ArrowDown, tone: 'border-berry hover:border-berry hover:bg-berry/15' }];
// Los sprites llegan como ruta del proxy (`/api/pokemon/{id}/sprite`); se sirven desde el origen de la API.
const spriteSource = (sprite: string) => sprite.startsWith('/api/') ? apiAsset(sprite) : sprite;

/** Tarjeta de un Pokémon: por debajo de `sm` van dos por fila (sprite de 96 px) para dejar las respuestas a la vista. */
function PokemonCard({ label, pokemon, category, tone }: { label: string; pokemon: HigherLowerPokemonView; category: string; tone: string }) {
  return <article className="card min-w-0 !p-3 text-center sm:!p-5">
    <span className="label">{label}</span>
    <img className="mx-auto h-24 w-24 object-contain sm:h-44 sm:w-44" src={spriteSource(pokemon.sprite)} alt="" />
    <h2 className="truncate font-display text-lg sm:text-2xl" title={pokemon.name}>{pokemon.name}</h2>
    <p className="truncate text-sm font-extrabold text-ink/70" title={category}>{category}</p>
    <strong className={`font-display text-2xl tabular-nums ${tone}`}>{pokemon.value ?? '???'}</strong>
  </article>;
}

export function HigherLowerGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as HigherLowerPublicState; const player = room.gamePlayerState as HigherLowerPlayerState; const [pending, setPending] = useState(false); const [error, setError] = useState(''); const offset = useServerOffset(room.serverNow); const remaining = Math.ceil(useRemainingMs(game.roundEndsAt ?? game.nextTransitionAt, offset) / 1000); const reveal = game.phase === 'ROUND_RESULTS';
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const category = categoryLabels[game.category];
  // Solo en `ROUND_RESULTS`: en la ronda siguiente `lastRound` sigue siendo el de la anterior.
  const lastRound = reveal ? game.lastRound : null;
  const selfOutcome = lastRound?.outcomes[selfId] ?? null;
  const milestone = selfOutcome ? higherLowerStreakMilestone(selfOutcome) : null;
  useSfxCue('tick', player.answer ? game.roundNumber : null);
  useSfxCue(selfOutcome ? selfOutcome.correct ? 'hit' : 'miss' : null, selfOutcome ? game.roundNumber : null);
  async function answer(choice: HigherLowerChoice) { setPending(true); setError(''); try { await onAction({ type: 'ANSWER', choice }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Respuesta rechazada'); } finally { setPending(false); } }
  return <section className="mx-auto max-w-7xl px-4 py-6"><header className="mb-5 flex items-end justify-between gap-3"><div className="min-w-0"><span className="label">Ronda {game.roundNumber} de {game.totalRounds}</span><h1 className="font-display text-3xl">{category}</h1></div><span className="chip text-lg tabular-nums"><Clock3 size={18} /> {remaining}s</span></header>
    {milestone && <RevealCutIn key={game.roundNumber} tone="electric" title={milestone.title} subtitle={milestone.subtitle} />}
    {lastRound && <div className="reveal-pop mb-5 rounded-2xl border border-electric bg-electric/15 p-4 text-center"><strong className="font-display text-2xl">Respuesta: {higherLowerChoiceLabels[lastRound.correctAnswer]}</strong><p className="font-bold tabular-nums text-ink/70">{higherLowerRevealCountdown(game, remaining)}</p><HigherLowerBars previous={{ name: game.previousPokemon.name, value: lastRound.previousValue }} current={{ name: game.currentPokemon.name, value: lastRound.currentValue }} /></div>}
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]"><div><div className="grid grid-cols-2 gap-3 sm:gap-4"><PokemonCard label="Pokémon anterior" pokemon={game.previousPokemon} category={category} tone="text-aqua" /><PokemonCard label="¿Su valor es…?" pokemon={game.currentPokemon} category={category} tone="text-berry" /></div>
      {game.phase === 'ROUND_ACTIVE' && player.canAnswer && <div className="answer-dock mt-4 grid grid-cols-3 gap-2 sm:gap-3">{choices.map(({ id, icon: Icon, tone }) => <button key={id} type="button" disabled={pending} aria-busy={pending} onClick={() => void answer(id)} className={`btn-ghost min-h-11 px-2 font-display text-lg sm:p-4 sm:text-xl ${tone}`}><Icon aria-hidden="true" />{higherLowerChoiceLabels[id]}</button>)}</div>}
      {game.phase === 'ROUND_ACTIVE' && player.answer && <p className="mt-4 rounded-2xl bg-leaf/10 p-3 text-center font-extrabold text-leaf"><Check className="mr-2 inline" />Respuesta {higherLowerChoiceLabels[player.answer.choice]} bloqueada.</p>}
      {error && <p role="alert" className="status-error mt-3 text-center">{error}</p>}
      {lastRound && <div className="card mt-4 !p-4"><div className="grid gap-2 sm:grid-cols-2">{game.playerIds.map((id) => { const outcome = lastRound.outcomes[id]; const name = members.get(id)?.displayName ?? id; return <div key={id} className={`rounded-xl p-3 ${outcome?.correct ? 'bg-leaf/10' : 'bg-berry/10'}`}><div className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate" title={name}>{name}</strong><span className="font-extrabold tabular-nums">{outcome?.correct ? `✓ +${outcome.awardedPoints}` : '✗'}</span></div>{outcome?.correct && <p className="text-sm font-extrabold text-electric"><Flame className="inline" size={15} aria-hidden="true" /> {higherLowerOutcomeLine(outcome)}</p>}</div>; })}</div></div>}
    </div><aside className="space-y-4"><div className="card !p-4"><h2 className="mb-3 flex gap-2 font-display text-xl"><Trophy className="text-electric" /> Clasificación</h2>{[...game.playerIds].sort((a, b) => game.scores[b]! - game.scores[a]!).map((id) => { const name = members.get(id)?.displayName ?? id; const streak = game.streaks[id] ?? 0; const won = id === selfId && selfOutcome?.correct ? selfOutcome.awardedPoints : 0; return <div key={id} className="mb-2 rounded-xl bg-ink/[.04] p-2"><div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-bold" title={name}>{name}</span>{won > 0 && <ScorePop key={game.roundNumber} points={won} tone="leaf" />}<strong className="tabular-nums">{game.scores[id]} pts</strong></div><span key={streak} className={`inline-block text-xs font-extrabold tabular-nums text-electric ${streak > 0 ? 'motion-bump' : ''}`} data-streak={id}>🔥 Racha {streak}</span></div>; })}</div><div className="card !p-4"><h2 className="mb-3 font-display text-xl">Respuestas</h2>{choices.map(({ id }) => <div key={id} className="mb-2 rounded-xl bg-ink/[.04] p-2"><strong>{higherLowerChoiceLabels[id]}</strong><div className="mt-1 flex flex-wrap gap-1">{Object.entries(game.answers).filter(([, answer]) => answer.choice === id).map(([playerId]) => <span key={playerId} className="chip text-xs">{members.get(playerId)?.displayName}</span>)}</div></div>)}{Object.keys(game.answers).length === 0 && game.answeredIds.length > 0 && <div className="flex flex-wrap gap-1">{game.answeredIds.map((id) => <span key={id} className="chip text-xs">{members.get(id)?.displayName} ✓</span>)}</div>}</div></aside></div>
  </section>;
}
