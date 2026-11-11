import { IMPOSTOR_CLUE_MAX_CODE_POINTS, IMPOSTOR_SKIP_TARGET, type PokemonImpostorConfig, type PokemonImpostorPlayerState, type PokemonImpostorPublicState } from '@pokemon-universe/shared/public';
import { Check, Clock3, Eye, Hourglass, Lock, MousePointerClick, Send, TimerOff, UserX, Vote } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ServerTimer } from '../../components/ServerTimer';
import { ImpostorClueBoard, ImpostorEliminationPlate, ImpostorHud, ImpostorPlate, ImpostorPlayersPanel, ImpostorRolePanel, ImpostorRoleReveal, ImpostorRoleStrip, ImpostorVoteGrid, ImpostorVoteResultPanel, type ImpostorPeople, type PlateProps } from './ImpostorParts';
import { impostorAnnouncement, impostorClueAction, impostorFocusKey, impostorGuessAction, impostorPhaseTitle, impostorRoundLabel, impostorTimerLabel, impostorVoteAction } from './presentation';
import { validateImpostorClue } from './validation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { useReducedMotion } from '../../lib/motion';
import { useServerOffset } from '../../hooks/useServerTime';
import { useSfxCue } from '../../hooks/useSfxCue';
import { useDelayElapsed } from '../../hooks/useTimedVisibility';
import { MomentCutin, CUTIN_DELAYED_LINE_MS, cx, Field, Panel, Pill, ScreenSplit } from '../../ui';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { GameSkipSlot } from '../../room/game-kit/GameSkipSlot';
import { PokemonSelector } from '../../room/game-kit/PokemonSelector';
import { clampImpostorClue, impostorClueLength, impostorEliminationAnnouncement, impostorEliminationCutIn } from './pokemon-impostor-texts';
import { type ActiveGameProps, sendWithBusy } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './PokemonImpostor.module.css';

/**
 * Pokémon Impostor (spec §2 y §6 «Juegos»). Arriba se mira: la placa de la ronda (fase y tiempo) y la escena de la fase
 * (el reparto de roles, el orden con las pistas, los candidatos, el recuento o la expulsión). Abajo se actúa: escribir
 * la pista, confirmar el voto, adivinar el Pokémon o el estado. Al lado, tu rol y los jugadores.
 *
 * Privacidad: solo se pinta lo que proyecta el servidor (el impostor no recibe el Pokémon; los roles ajenos no se
 * enseñan hasta los resultados). En la expulsión, nada que dependa del rol entra en el DOM antes de la pausa de 1 s del
 * cut-in (al momento con reducción de movimiento).
 */
export function PokemonImpostorGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonImpostorPublicState;
  const player = room.gamePlayerState as PokemonImpostorPlayerState;
  const config = room.selectedGameConfig as PokemonImpostorConfig;
  const { byId: members, colorIndex: colors, nameOf } = useRoomMembers(room);
  const people: ImpostorPeople = useMemo(() => ({ members, colors, selfId, nameOf, outIds: new Set(game.eliminatedIds) }), [colors, members, nameOf, selfId, game.eliminatedIds]);
  const [clueText, setClueText] = useState('');
  const [voteDraft, setVoteDraft] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showGuess, setShowGuess] = useState(false);
  const serverOffset = useServerOffset(room.serverNow);
  const clueLength = impostorClueLength(clueText);
  // El campo es el único dueño del error de la pista (también la rechaza el servidor).
  const clueError = validateImpostorClue(clueText, game.mode, player.secretPokemon?.name);
  const { pokemon, loading: poolLoading, error: poolError, retry: retryPool } = usePokemonPool({ generations: config.generations, enabled: player.canGuessPokemon });

  const elimination = game.phase === 'ELIMINATION' ? game.eliminationReveal : null;
  const eliminationCutIn = elimination ? impostorEliminationCutIn(elimination, people.nameOf(elimination.playerId)) : null;
  useSfxCue('game.eliminate', elimination ? `${game.roundNumber}:${game.votingRound}` : null);
  // El rol de la placa sigue la misma pausa que el cut-in: no está en el DOM hasta pasado 1 s.
  const reducedMotion = useReducedMotion();
  const eliminationRoleShown = useDelayElapsed(CUTIN_DELAYED_LINE_MS, elimination ? `${game.roundNumber}:${elimination.playerId}` : 'none', reducedMotion);

  useEffect(() => { setClueText(''); setVoteDraft(null); }, [game.phase, game.roundNumber, game.votingRound]);
  useEffect(() => { if (!player.canGuessPokemon) setShowGuess(false); }, [player.canGuessPokemon]);

  // Foco: llega tu turno, envías la pista, gastas el intento o confirmas el voto (el control enfocado desaparece).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusOnTransition(impostorFocusKey(game, player), player.canSubmitClue ? inputRef : titleRef);

  async function submitClue() {
    const action = impostorClueAction(player, clueText, clueError, clueLength);
    if (!action || submitting) return;
    await sendWithBusy(setSubmitting, () => onAction(action));
  }
  async function submitVote() {
    const action = impostorVoteAction(player, voteDraft);
    if (!action || submitting) return;
    await sendWithBusy(setSubmitting, () => onAction(action));
  }
  // Nunca rechaza (el buscador pintaría el error en línea): el aviso de la sala ya lo dice. Solo cierra si sale bien.
  async function guessPokemon(pokemonId: string) {
    const action = impostorGuessAction(player, pokemonId);
    if (!action || submitting) return;
    await sendWithBusy(setSubmitting, () => onAction(action), () => setShowGuess(false));
  }

  const orderedIds = game.phase === 'CLUE_PHASE'
    ? [...game.clueOrder, ...game.playerIds.filter((id) => !game.clueOrder.includes(id))]
    : game.playerIds;
  const deadline = game.roundEndsAt ?? game.nextTransitionAt;
  const totalMs = game.phase === 'CLUE_PHASE' ? config.clueSeconds * 1_000 : game.phase === 'VOTING' ? config.voteSeconds * 1_000 : undefined;
  const timer = deadline ? <ServerTimer deadline={deadline} serverOffset={serverOffset} label={impostorTimerLabel(game.phase)} {...(totalMs ? { totalMs } : {})} /> : null;

  const scene = game.phase === 'ROLE_REVEAL'
    ? <ImpostorRoleReveal player={player} people={people} />
    : game.phase === 'VOTING'
      ? <ImpostorVoteGrid game={game} people={people} selectedId={player.ownVote?.targetId ?? voteDraft} interactive={player.canVote && !submitting} onSelect={setVoteDraft} />
      : game.phase === 'VOTE_RESULTS' && game.lastVoteResult
        ? <ImpostorVoteResultPanel result={game.lastVoteResult} aliveIds={game.aliveIds} people={people} />
        : elimination
          ? <ImpostorEliminationPlate reveal={elimination} roleShown={eliminationRoleShown} reducedMotion={reducedMotion} winnerTeam={game.winnerTeam} people={people} />
          : <ImpostorClueBoard game={game} people={people} orderedIds={orderedIds} />;

  const top = <div className={s.top}>
    <ImpostorHud roundLabel={impostorRoundLabel(game)} alive={game.aliveIds.length} tiebreak={game.phase === 'VOTING' && game.votingRound > 1} title={impostorPhaseTitle(game, people.nameOf)} timer={timer}
      strip={game.phase !== 'ROLE_REVEAL' ? <ImpostorRoleStrip player={player} people={people} /> : null} />
    {scene}
  </div>;

  const side = <div className={s.side}>
    {game.phase !== 'ROLE_REVEAL' && <ImpostorRolePanel player={player} phase={game.phase} guessOpen={showGuess} onToggleGuess={() => setShowGuess((open) => !open)} people={people} />}
    {game.phase !== 'CLUE_PHASE' && <ImpostorPlayersPanel game={game} people={people} className={s.sidePanel} />}
    <GameSkipSlot className={s.skip} />
  </div>;

  const plate = impostorPlate({ game, player, people, voteDraft, submitting, roleShown: eliminationRoleShown, onConfirm: () => void submitVote() });
  const bottom = game.phase === 'CLUE_PHASE' && player.canSubmitClue
    ? <Panel variant="cream" as="section" aria-label="Tu pista" bodyClassName={cx(s.clueForm)}>
      <Field ref={inputRef} className={cx(s.clueField)} label="Tu pista" value={clueText} placeholder="Escribe algo relacionado…" autoComplete="off" maxLength={200}
        error={clueError}
        hint={`${game.mode === 'ONE_WORD' ? 'Una sola palabra · ' : ''}${clueLength}/${IMPOSTOR_CLUE_MAX_CODE_POINTS} caracteres`}
        onChange={(event) => setClueText(clampImpostorClue(event.target.value))}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submitClue(); } }} />
      <Pill variant="yellow" size="main" icon={Send} disabled={!clueText.trim() || clueError !== null} loading={submitting} onClick={() => void submitClue()}>Enviar pista</Pill>
    </Panel>
    : game.phase === 'CLUE_PHASE' && showGuess && player.canGuessPokemon
      ? <div className={s.selector}><PokemonSelector pokemon={pokemon} loading={poolLoading} loadError={poolError} onRetry={retryPool} locked={new Set()} disabled={submitting} inputLabel="Adivinar el Pokémon" onSelect={guessPokemon} /></div>
      : <ImpostorPlate {...plate} titleRef={titleRef} />;

  return <div className={cx('content-row', s.screen)}>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
    {/* Una sola región viva, siempre montada: solo cambia su texto. La expulsión también va aquí (el cut-in solo se ve). */}
    <p className="sr-only" role="status" aria-live="polite">{elimination ? impostorEliminationAnnouncement(elimination, people.nameOf(elimination.playerId), eliminationRoleShown) : impostorAnnouncement(game, player, selfId, people.nameOf)}</p>
    {elimination && eliminationCutIn && <MomentCutin key={`${game.roundNumber}:${elimination.playerId}`} tone="yellow" delayedTone={eliminationCutIn.tone} title={eliminationCutIn.title} delayedLine={eliminationCutIn.delayedLine} holdMs={3_200} media={<Avatar name={eliminationCutIn.title} avatar={members.get(elimination.playerId)?.avatar} size="lg" />} />}
  </div>;
}

/** Placa de la pantalla inferior según la fase y lo que puede hacer el jugador. */
function impostorPlate({ game, player, people, voteDraft, submitting, roleShown, onConfirm }: {
  game: PokemonImpostorPublicState;
  player: PokemonImpostorPlayerState;
  people: ImpostorPeople;
  voteDraft: string | null;
  submitting: boolean;
  roleShown: boolean;
  onConfirm(): void;
}): PlateProps {
  const watching = !player.role || !player.alive;
  switch (game.phase) {
    case 'ROLE_REVEAL':
      return { icon: Lock, tone: 'info', kicker: 'Información privada', title: player.role ? 'Memoriza tu rol' : 'Reparto de roles', text: 'Esta información es privada. La fase de pistas comenzará automáticamente.' };
    case 'CLUE_PHASE': {
      if (player.ownClue?.status === 'SUBMITTED') return { icon: Check, tone: 'ok', kicker: 'Pista enviada', title: 'Tu pista está enviada y bloqueada.', text: `Escribiste «${player.ownClue.text ?? ''}».` };
      if (player.ownClue) return { icon: TimerOff, tone: 'bad', kicker: 'Sin pista', title: 'Se acabó tu turno', text: 'Esta ronda te quedas sin pista. Fíjate en las del resto.' };
      if (watching) return { icon: Eye, tone: 'info', kicker: 'Sin pista esta ronda', title: 'Estás observando', text: 'Los jugadores vivos dan sus pistas por turnos.' };
      const current = game.currentCluePlayerId ? people.nameOf(game.currentCluePlayerId) : null;
      return { icon: Hourglass, tone: 'info', kicker: 'Pistas por turnos', title: current ? `Ahora escribe ${current}` : 'Esperando turnos', text: 'Cuando llegue tu turno podrás escribir tu pista aquí.' };
    }
    case 'VOTING': {
      if (player.ownVote) return { icon: Check, tone: 'ok', kicker: 'Voto bloqueado', title: 'Tu voto está bloqueado.', text: 'El objetivo permanece secreto hasta el recuento.' };
      if (!player.canVote) return { icon: Eye, tone: 'info', kicker: 'Sin voto', title: 'Estás observando', text: 'Los jugadores vivos eligen a quién expulsar.' };
      const target = voteDraft === IMPOSTOR_SKIP_TARGET ? 'Saltar' : voteDraft ? people.nameOf(voteDraft) : null;
      return { icon: target ? Vote : MousePointerClick, tone: target ? 'warn' : 'info', kicker: target ? 'Has elegido' : 'Tu voto',
        title: target ?? 'Elige a quién expulsar', text: 'Tres rondas seguidas sin expulsión dan la victoria a los impostores.',
        aside: <Pill variant="yellow" size="main" icon={Vote} disabled={!voteDraft} loading={submitting} onClick={onConfirm}>Confirmar voto</Pill> };
    }
    case 'VOTE_RESULTS': {
      const kind = game.lastVoteResult?.kind;
      if (kind === 'TIE') return { icon: Vote, tone: 'warn', kicker: 'Empate', title: 'Se vota otra vez', text: 'Solo entre los jugadores empatados.' };
      if (kind === 'ELIMINATION') return { icon: UserX, tone: 'warn', kicker: 'Expulsión', title: 'Llega la expulsión', text: 'Su rol se descubre en unos segundos.' };
      return { icon: Clock3, tone: 'info', kicker: 'Nadie sale', title: 'La partida sigue', text: 'Tres rondas seguidas sin expulsión dan la victoria a los impostores.' };
    }
    default: {
      // Igual para los dos roles hasta la pausa: ni el texto ni el tono adelantan el rol.
      const self = game.eliminationReveal?.playerId === people.selfId;
      return { icon: UserX, tone: 'warn', kicker: 'Expulsión', title: self ? 'Te han expulsado' : 'Jugador expulsado',
        text: roleShown ? self ? 'Sigues la partida como espectador.' : 'Mira el cut-in: ya se sabe su rol.' : 'Su rol se descubre en un segundo.' };
    }
  }
}
