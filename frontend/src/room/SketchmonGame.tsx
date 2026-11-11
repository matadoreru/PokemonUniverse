import type { PokemonType, RoomView, SketchmonConfig, SketchmonPlayerState, SketchmonPublicState } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS, SKETCHMON_DRAWER_POINTS } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Brush, Check, Clock3, Eye, Hourglass, Palette, Radio, Trophy, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import {
  SKETCH_STEPS, SKETCH_TURN_TEXT, sketchAnnouncement, sketchCanvasLabel, sketchCurrentStep, sketchHeading, sketchRevealSummary, sketchRole, sketchRoundLabel,
  sketchTurnStatus, sketchVerdict, type SketchTurnStatus,
} from '../games/sketchmon/presentation';
import { SketchCanvasPanel, SketchHints, SketchSecretPanel, SketchToolbar } from '../games/sketchmon/SketchParts';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Chip, cx, Icon, TypeBadge, type ChipProps } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { GuessAttemptsFeed, GuessPanel, GuessRoundReveal, guessOwnLastAttempt, guessPublicAttempts, pointsWord } from './guess-kit';
import { useSketchPad } from './SketchmonCanvas';
import { PhaseRail, ResponseProgress, SocialPlate, SocialScreen, type ProgressStatus } from './social-kit';
import s from '../games/sketchmon/Sketchmon.module.css';

const GAME_NAME = 'Sketchmon';
const SCORING = 'Cuanto antes aciertes, más puntos (de 5 a 2); tras un fallo hay una breve espera.';
const RULE = `Quien acierta suma de 5 a 2 puntos según lo rápido; quien dibuja, ${SKETCHMON_DRAWER_POINTS} si alguien acierta.`;
const typeLabel = (type: string) => POKEMON_TYPE_LABELS[type as PokemonType] ?? type;

const TURN_ICON: Record<SketchTurnStatus, LucideIcon> = { drawing: Brush, drew: Brush, next: ArrowRight, done: Check, pending: Hourglass };
const TURN_TONE: Record<SketchTurnStatus, NonNullable<ChipProps['tone']>> = { drawing: 'warn', drew: 'info', next: 'info', done: 'neutral', pending: 'neutral' };

type GameAction = (action: unknown, options?: { report?: boolean }) => Promise<void>;

/**
 * Sketchmon con el kit social (spec §2 y §6 «Juegos»): Poké Taboo con un lienzo en lugar de pistas de texto. Arriba, la
 * placa del dibujo («Dibujo N de M · Vuelta a de b», quién dibuja y el plazo), las fases y la escena: quien dibuja ve
 * su Pokémon secreto y el lienzo; los demás, el lienzo en directo y las pistas automáticas. Abajo, la acción: las
 * herramientas (quien dibuja; en escritorio van bajo el secreto y el lienzo se lleva todo el alto), el buscador compacto
 * (quien adivina) o el veredicto. Al lado, el orden de turnos en texto con los puntos y los intentos públicos.
 *
 * Privacidad: el secreto solo llega en el estado propio de quien dibuja (`secretPokemon`) y solo se pinta con él; la
 * respuesta para los demás solo llega en `lastRound`, que la pantalla lee únicamente en `ROUND_RESULTS`.
 */
export function SketchmonGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction: GameAction }) {
  const game = room.game as SketchmonPublicState;
  const player = room.gamePlayerState as SketchmonPlayerState | null;
  const config = room.selectedGameConfig as Partial<SketchmonConfig> | null;
  const role = sketchRole(player);
  const active = game.phase === 'ROUND_ACTIVE';
  const canGuess = active && player?.role === 'GUESSER' && player.canGuess;
  const secret = active && player?.role === 'DRAWER' ? player.secretPokemon : null;
  const drawing = active && player?.role === 'DRAWER';
  // La revelación solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeForms ?? false, enabled: canGuess });
  const offset = useServerOffset(room.serverNow);
  const cooldownMs = useRemainingMs(player?.role === 'GUESSER' ? player.cooldownUntil : null, offset);
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);
  // Escritorio: las herramientas van en la columna del secreto y el lienzo se queda con todo el alto de la escena.
  const wide = useMediaQuery('(min-width: 1024px)');
  const pad = useSketchPad({ strokes: game.strokes, onAction, enabled: drawing && player.canDraw, resetKey: game.roundNumber });

  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const nameOf = (id: string) => members.get(id)?.displayName ?? 'Entrenador';
  const drawerId = result?.drawerId ?? game.drawerId;
  const drawerName = drawerId ? nameOf(drawerId) : null;
  const participating = player !== null && player.role !== 'SPECTATOR';
  // Con los intentos públicos apagados, los propios llegan en la vista del jugador.
  // Con los intentos públicos apagados, quien dibuja recibe los de todos en su vista (los necesita para guiarse); quien adivina u observa no ve el panel.
  const feedAttempts = guessPublicAttempts(config) ? game.attempts : player?.role === 'DRAWER' ? player.attempts ?? [] : null;
  const ownLast = canGuess ? guessOwnLastAttempt((player?.role === 'GUESSER' ? player.attempts : undefined) ?? game.attempts, selfId) : null;

  const titleRef = useRef<HTMLHeadingElement>(null);
  // Cambia con la fase, el dibujo y el rol (quien dibuja pasa a ver la revelación como uno más).
  useFocusOnTransition(`${game.phase}-${game.roundNumber}-${role}`, titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const timer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Tiempo', totalMs: config?.roundSeconds ? config.roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente dibujo' };
  const announcement = sketchAnnouncement({
    phase: game.phase, roundNumber: game.roundNumber, role, drawerName, secretName: secret?.name ?? null, ownLast, hints: game.visibleHints,
    syncError: drawing ? pad.syncError : null, syncErrorSeq: pad.syncErrorSeq, result, nameOf, typeLabel,
  });
  const heading = sketchHeading({ phase: game.phase, role, drawerName, secretName: secret?.name ?? null, result });
  // «En directo» va en la placa de la ronda: el lienzo de quien mira no lleva barra de título (el `h1` ya dice de quién es).
  const live = active && role !== 'drawer';
  const meta = drawerName && <Chip tone="warn" icon={<Icon icon={live ? Radio : Palette} size={18} />}>
    {role === 'drawer' && !result ? 'Dibujas tú' : live ? `Dibuja ${drawerName} · En directo` : `Dibuja ${drawerName}`}
  </Chip>;
  const hints = game.visibleHints.length > 0 && !result ? <SketchHints hints={game.visibleHints} /> : null;

  // Escena: el secreto y el lienzo (quien dibuja), el lienzo en directo (los demás) o la revelación con el dibujo final.
  let stage;
  if (result) {
    stage = <div className={s.pair}>
      <GuessRoundReveal answers={[{ id: result.pokemon.id, name: result.pokemon.name, sprite: result.pokemon.sprite }]} kicker={`Dibujo ${game.roundNumber} · resultado`} className={s.reveal}
        details={<><span className={s.revealSummary} data-testid="sketch-reveal-summary">{sketchRevealSummary(result, nameOf)}</span>
          <span className={s.revealFacts}>{result.pokemon.types.map((type) => <TypeBadge key={type} type={type} label={typeLabel(type)} size="sm" />)}<span>Generación {result.pokemon.generation}</span></span></>} />
      <SketchCanvasPanel strokes={result.drawing} title={`Dibujo de ${drawerName ?? 'Entrenador'}`} label={`Dibujo final de ${result.pokemon.name}`} emptyText="Sin trazos" testId="sketch-final" className={s.finalPanel} />
    </div>;
  } else if (role === 'drawer' && active) {
    stage = <div className={s.drawStage}>
      <div className={s.drawSide}>
        {secret && <SketchSecretPanel pokemon={secret} serverOffset={offset} titleRef={titleRef} />}
        {drawing && wide && <SketchToolbar pad={pad} disabled={!player.canDraw} className={s.toolsSide} />}
      </div>
      <div className={s.drawMain}>
        <SketchCanvasPanel strokes={game.strokes} label={sketchCanvasLabel(pad.tool)} pad={pad} emptyText="Empieza tu dibujo" testId="sketch-canvas" />
        {hints}
      </div>
    </div>;
  } else {
    stage = <div className={s.drawMain}>
      <SketchCanvasPanel strokes={game.strokes} label={`Dibujo en directo de ${drawerName ?? 'otro jugador'}`}
        emptyText={active ? 'Esperando el primer trazo…' : 'Preparando el dibujo…'} testId="sketch-live" />
      {hints}
    </div>;
  }

  const turnOrder = <ResponseProgress title="Orden de turnos" members={room.members} playerIds={game.drawerOrder} doneIds={[]} selfId={selfId} count={false}
    status={(id): ProgressStatus => { const status = sketchTurnStatus(game, id); return { tone: TURN_TONE[status], text: SKETCH_TURN_TEXT[status], icon: TURN_ICON[status] }; }}
    value={(id) => `${game.scores[id] ?? 0} pts`} note="Cada jugador dibuja una vez por vuelta; el orden se vuelve a mezclar en la siguiente." />;
  const turnPoints = result && <ResponseProgress title="Puntos del dibujo" members={room.members} playerIds={game.drawerOrder} doneIds={[]} selfId={selfId} count={false}
    status={(id): ProgressStatus => {
      if (id === result.winnerId) return { tone: 'ok', text: `Acertó · ${result.winnerAttemptCount ?? 1} ${result.winnerAttemptCount === 1 ? 'intento' : 'intentos'}`, icon: Trophy };
      if (id === result.drawerId) return result.winnerId ? { tone: 'ok', text: 'Dibujó', icon: Brush } : { tone: 'bad', text: 'Dibujó · nadie acertó', icon: Brush };
      return { tone: 'neutral', text: 'No acertó', icon: X };
    }}
    value={(id) => `+${id === result.winnerId ? result.guesserPoints : id === result.drawerId ? result.drawerPoints : 0}`} />;
  const side = <>
    {turnPoints || turnOrder}
    {feedAttempts && <GuessAttemptsFeed attempts={feedAttempts} members={members} colors={colors} emptyText="Cada fallo sale aquí para todos. Tras un fallo hay una breve espera antes del siguiente intento." />}
  </>;

  let bottom;
  if (result) {
    const verdict = sketchVerdict(result, selfId, participating);
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: verdict.tone === 'ok' ? Trophy : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: `${last ? 'Clasificación' : 'Siguiente dibujo'} en ${seconds}s`, text: RULE,
      ...(verdict.points > 0 ? { aside: <strong className={s.points}>+{verdict.points}<small> {pointsWord(verdict.points)}</small></strong> } : {}),
    }} />;
  } else if (drawing) {
    bottom = wide ? null : <SketchToolbar pad={pad} disabled={!player.canDraw} />;
  } else if (role === 'guesser' || role === 'watcher') {
    bottom = <GuessPanel kind={canGuess ? 'guess' : role === 'watcher' ? 'watching' : 'waiting'} titleRef={titleRef} question="Busca el Pokémon dibujado" guessText={SCORING} gameName={GAME_NAME}
      cooldownMs={cooldownMs} lastWrong={ownLast?.guessedPokemon.name ?? null} attemptCount={player?.role === 'GUESSER' ? player.attemptCount : 0}
      watchingText="Estás observando: puedes seguir el dibujo y los intentos." compact
      selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para el dibujo ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando el dibujo…', text: 'El dibujo empieza en un momento.' }} />;
  }

  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} roundLabel={sketchRoundLabel(game)} heading={heading} meta={meta} timer={timer}
    announcement={announcement} phases={<PhaseRail steps={SKETCH_STEPS} current={sketchCurrentStep(game.phase)} className={s.phases} />} stage={stage} side={side} bottom={bottom}
    className={cx(s.screen, drawing && s.drawing, active && s.active)} />;
}
