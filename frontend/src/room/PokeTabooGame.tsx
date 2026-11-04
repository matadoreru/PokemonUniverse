import type { PokeTabooConfig, PokeTabooPlayerState, PokeTabooPublicState, RoomView } from '@pokemon-universe/shared/public';
import { POKE_TABOO_DESCRIPTOR_POINTS, POKE_TABOO_GUESSER_MAX_POINTS, POKE_TABOO_GUESSER_MIN_POINTS } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Check, Clock3, Eye, Hourglass, Mic, PenLine, Trophy, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { pokemonTypeLabels } from '../components/PokemonTypeBadge';
import {
  TABOO_STEPS, TURN_STATUS_TEXT, tabooAnnouncement, tabooCurrentStep, tabooHeading, tabooRevealSummary, tabooRole, tabooRoundLabel,
  tabooTurnStatus, tabooVerdict, type TabooTurnStatus,
} from '../games/poke-taboo/presentation';
import { TabooComposer, TabooHintList, TabooSecretPanel } from '../games/poke-taboo/TabooParts';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Chip, cx, Icon, TypeBadge, type ChipProps } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { GuessAttemptsFeed, GuessPanel, GuessRoundReveal, guessOwnLastAttempt, pointsWord } from './guess-kit';
import { PhaseRail, ResponseProgress, SocialPlate, SocialScreen, type ProgressStatus } from './social-kit';
import s from '../games/poke-taboo/PokeTaboo.module.css';

const GAME_NAME = 'PokéTaboo';
const SCORING = `Cuanto antes aciertes, más puntos (de ${POKE_TABOO_GUESSER_MAX_POINTS} a ${POKE_TABOO_GUESSER_MIN_POINTS}); tras un fallo hay una breve espera.`;
const RULE = `Quien acierta suma de ${POKE_TABOO_GUESSER_MAX_POINTS} a ${POKE_TABOO_GUESSER_MIN_POINTS} puntos según lo rápido; quien describe, ${POKE_TABOO_DESCRIPTOR_POINTS}.`;

const TURN_ICON: Record<TabooTurnStatus, LucideIcon> = { describing: Mic, described: Mic, next: ArrowRight, done: Check, pending: Hourglass };
const TURN_TONE: Record<TabooTurnStatus, NonNullable<ChipProps['tone']>> = { describing: 'warn', described: 'info', next: 'info', done: 'neutral', pending: 'neutral' };

/**
 * PokéTaboo con el kit social (spec §2 y §6 «Juegos»). Arriba: la placa del turno («Turno N de M · Vuelta a de b», quién
 * describe y el plazo), las fases y la escena. Quien describe ve su Pokémon secreto con las palabras prohibidas y sus
 * pistas; los demás, las pistas en franjas. Abajo, la acción: el campo de pistas (quien describe), el buscador con los
 * intentos (quien adivina) o el veredicto. Al lado, el orden de turnos en texto con los puntos y los intentos públicos.
 *
 * Privacidad: el secreto solo llega en el estado propio de quien describe (`secretPokemon`) y solo se pinta con él; la
 * respuesta para los demás solo llega en `lastRound`, que la pantalla lee únicamente en `ROUND_RESULTS`.
 */
export function PokeTabooGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokeTabooPublicState;
  const player = room.gamePlayerState as PokeTabooPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokeTabooConfig> | null;
  const role = tabooRole(player);
  const active = game.phase === 'ROUND_ACTIVE';
  const canGuess = active && player?.role === 'GUESSER' && player.canGuess;
  const secret = active && player?.role === 'DESCRIPTOR' ? player.secretPokemon : null;
  // La revelación solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeRegionalForms ?? true, enabled: canGuess });
  const offset = useServerOffset(room.serverNow);
  const cooldownMs = useRemainingMs(player?.role === 'GUESSER' ? player.cooldownUntil : null, offset);
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);

  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const nameOf = (id: string) => members.get(id)?.displayName ?? 'Entrenador';
  const describerId = result?.descriptorId ?? game.descriptorId;
  const describerName = describerId ? nameOf(describerId) : null;
  const participating = player !== null && player.role !== 'SPECTATOR';
  const ownLast = canGuess ? guessOwnLastAttempt(game.attempts, selfId) : null;

  const [problem, setProblem] = useState<string | null>(null);
  const onProblem = useCallback((word: string | null) => setProblem(word), []);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  // Cambia con la fase, el turno y el rol (quien describe pasa a ver la revelación como uno más).
  useFocusOnTransition(`${game.phase}-${game.roundNumber}-${role}`, titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const timer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Tiempo', totalMs: config?.roundSeconds ? config.roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente turno' };
  const announcement = tabooAnnouncement({
    phase: game.phase, roundNumber: game.roundNumber, role, describerName, secretName: secret?.name ?? null, hints: game.hints, ownLast,
    problem: secret ? problem : null, result, nameOf,
  });
  const heading = tabooHeading({ phase: game.phase, role, describerName, result });
  const meta = describerName && <Chip tone="warn" icon={<Icon icon={Mic} size={18} />}>{role === 'describer' ? 'Describes tú' : `Describe ${describerName}`}</Chip>;

  // Escena: el secreto y las pistas propias (quien describe), las pistas (los demás) o la revelación con las pistas que hubo.
  const hintsTitle = describerName ? `Pistas de ${describerName}` : 'Pistas';
  let stage;
  if (result) {
    stage = <div className={s.pair}>
      <GuessRoundReveal answers={[{ id: result.pokemon.id, name: result.pokemon.name, sprite: result.pokemon.sprite }]} kicker={`Turno ${game.roundNumber} · resultado`}
        details={<><span className={s.revealSummary} data-testid="taboo-reveal-summary">{tabooRevealSummary(result, nameOf)}</span>
          <span className={s.revealFacts}>{result.pokemon.types.map((type) => <TypeBadge key={type} type={type} label={pokemonTypeLabels[type]} size="sm" />)}<span>Generación {result.pokemon.generation}</span></span></>} className={s.reveal} />
      <TabooHintList hints={game.hints} title={hintsTitle} fresh={false} className={s.sideHints}
        emptyTitle="Sin pistas escritas" emptyText={`${describerName ?? 'Quien describía'} lo describió solo por voz.`} />
    </div>;
  } else if (role === 'describer' && secret) {
    stage = <div className={s.pair}>
      <TabooSecretPanel pokemon={secret} />
      <TabooHintList hints={game.hints} title="Tus pistas" emptyTitle="Aún no has escrito ninguna" emptyText="Describe por voz; si el grupo lo necesita, escribe pistas abajo." className={s.sideHints} />
    </div>;
  } else {
    stage = <TabooHintList hints={game.hints} title={hintsTitle} className={s.fill}
      emptyTitle={active ? 'La descripción se escucha fuera del juego' : 'Preparando el turno…'}
      emptyText={describerName ? `Si ${describerName} necesita texto, sus pistas aparecerán aquí.` : 'El turno empieza en un momento.'}
      help="Escucha la descripción en vuestro chat de voz; las pistas escritas aparecen aquí, la última arriba." />;
  }

  const turnOrder = <ResponseProgress title="Orden de turnos" members={room.members} playerIds={game.descriptorOrder} doneIds={[]} selfId={selfId} count={false}
    status={(id): ProgressStatus => { const status = tabooTurnStatus(game, id); return { tone: TURN_TONE[status], text: TURN_STATUS_TEXT[status], icon: TURN_ICON[status] }; }}
    value={(id) => `${game.scores[id] ?? 0} pts`} note="Cada jugador describe una vez por vuelta." />;
  const turnPoints = result && <ResponseProgress title="Puntos del turno" members={room.members} playerIds={game.descriptorOrder} doneIds={[]} selfId={selfId} count={false}
    status={(id): ProgressStatus => {
      if (id === result.winnerId) return { tone: 'ok', text: `Acertó · ${result.winnerAttemptCount ?? 1} ${result.winnerAttemptCount === 1 ? 'intento' : 'intentos'}`, icon: Trophy };
      if (id === result.descriptorId) return result.winnerId ? { tone: 'ok', text: 'Describió', icon: Mic } : { tone: 'bad', text: 'Describió · nadie acertó', icon: Mic };
      return { tone: 'neutral', text: 'No acertó', icon: X };
    }}
    value={(id) => `+${id === result.winnerId ? result.guesserPoints : id === result.descriptorId ? result.descriptorPoints : 0}`} />;
  const side = <>
    {turnPoints || turnOrder}
    <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} emptyText="Cada fallo sale aquí para todos. Tras un fallo hay una breve espera antes del siguiente intento." />
  </>;

  let bottom;
  if (result) {
    const verdict = tabooVerdict(result, selfId, participating);
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: verdict.tone === 'ok' ? Trophy : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: `${last ? 'Clasificación' : 'Siguiente turno'} en ${seconds}s`, text: RULE,
      ...(verdict.points > 0 ? { aside: <strong className={s.points}>+{verdict.points}<small> {pointsWord(verdict.points)}</small></strong> } : {}),
    }} />;
  } else if (role === 'describer' && active) {
    bottom = <SocialPlate titleRef={titleRef} search textClassName={s.plateHelp} content={{
      icon: PenLine, tone: 'info', kicker: 'Pistas de texto', title: 'Escribe una pista', text: 'Describe por voz; si hace falta, escribe pistas sin su nombre.',
    }}>
      <TabooComposer key={game.roundNumber} secret={secret} canSend={player?.role === 'DESCRIPTOR' && player.canSendHint} hintCount={game.hints.length} fieldRef={fieldRef}
        onProblem={onProblem} onSend={(text) => onAction({ type: 'SEND_HINT', text })} />
    </SocialPlate>;
  } else if (role === 'guesser' || role === 'watcher') {
    bottom = <GuessPanel kind={canGuess ? 'guess' : role === 'watcher' ? 'watching' : 'waiting'} titleRef={titleRef} question="Busca el Pokémon descrito" guessText={SCORING} gameName={GAME_NAME}
      cooldownMs={cooldownMs} lastWrong={ownLast?.guessedPokemon.name ?? null} attemptCount={player?.role === 'GUESSER' ? player.attemptCount : 0}
      watchingText="Puedes seguir las pistas y los intentos."
      selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando el turno…', text: 'El turno empieza en un momento.' }} />;
  }

  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} roundLabel={tabooRoundLabel(game)} heading={heading} meta={meta} timer={timer}
    announcement={announcement} phases={<PhaseRail steps={TABOO_STEPS} current={tabooCurrentStep(game.phase)} />} stage={stage} side={side} bottom={bottom} className={cx(s.screen)} />;
}
