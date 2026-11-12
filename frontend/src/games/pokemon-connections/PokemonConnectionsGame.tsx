import type { PokemonConnectionsConfig, PokemonConnectionsPlayerState, PokemonConnectionsPublicState } from '@pokemon-universe/shared/public';
import { ArrowRight, Check, CheckCircle2, Clock3, Eye, Lightbulb, MousePointerClick, Puzzle, ShieldX, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionsBand, ConnectionsBoard, ConnectionsProgress, ConnectionsRoundBoard } from './ConnectionsParts';
import { connectionsAnnouncement, connectionsFeedbackText, connectionsFocusKey, connectionsGroupAction, connectionsLivesText, connectionsPlateKind, nextAttemptFocus, type AttemptFocusState, type ConnectionsPlateKind } from './presentation';
import { useRemainingMs, useServerOffset } from '../../hooks/useServerTime';
import { useOutcomeCue } from '../../room/game-kit/useOutcomeCue';
import { Chip, Icon, Pill, ScorePop } from '../../ui';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { GAME_SIDE_FIT, GameScreen, type GameTimer } from '../../room/game-kit/GameScreen';
import { GuessPanel, type GuessPlateContent } from '../../room/guess-kit';
import { type ActiveGameProps, sendWithBusy } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './PokemonConnections.module.css';

/**
 * Pokémon Connections (spec §2 y §6 «Juegos»), en el marco de juego (`GameScreen`). Arriba se mira: la placa del puzle
 * con el plazo y el tablero, una rejilla de `groupSize` columnas con las cartas seleccionables (`Card` conmutadoras) y,
 * encima, cada grupo encontrado como una banda con su tema en texto. Abajo se actúa: cuántas llevas elegidas, los errores que quedan, lo que dijo el
 * último intento y «Comprobar». Al lado, el progreso de cada jugador (cuántos grupos, nunca cuáles).
 *
 * Al revelar, el tablero pasa a ser todos los grupos (los tuyos marcados como encontrados o no) y el lateral, la
 * clasificación de la ronda; el host puede avanzar antes del avance automático.
 *
 * Privacidad: durante la ronda solo se pintan los grupos propios (`foundGroups` del estado del jugador); `lastRound`
 * solo se lee en `ROUND_RESULTS`.
 */
export function PokemonConnectionsGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonConnectionsPublicState;
  const player = room.gamePlayerState as PokemonConnectionsPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonConnectionsConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  // Solo en `ROUND_RESULTS`: es la única forma de leer la solución.
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const own = player?.role === 'PLAYER' ? player : null;
  const kind = connectionsPlateKind(game.phase, player, lastRound !== null);
  const foundGroups = useMemo(() => kind === 'reveal' || !own ? [] : own.foundGroups, [kind, own]);
  const foundIds = useMemo(() => new Set(foundGroups.flatMap((group) => group.pokemon.map((pokemon) => pokemon.id))), [foundGroups]);
  const remaining = Math.ceil(useRemainingMs(game.nextTransitionAt, offset) / 1000);

  useEffect(() => { setSelected([]); setSubmitting(false); }, [game.roundNumber]);
  useEffect(() => { setSelected((current) => current.filter((id) => !foundIds.has(id))); }, [foundIds]);

  const feedback = own?.lastAttempt ?? null;
  useOutcomeCue(feedback ? feedback.kind === 'CORRECT' : null, feedback?.attemptedAt);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Solo un intento nuevo (no el que ya había al montar o al reconectar) lleva el foco a la placa.
  const attemptFocus = useRef<AttemptFocusState | null>(null);
  attemptFocus.current = nextAttemptFocus(attemptFocus.current, feedback?.attemptedAt ?? null);
  const freshAttempt = feedback !== null && attemptFocus.current.fresh === feedback.attemptedAt;
  useFocusOnTransition(connectionsFocusKey(kind, game.roundNumber, feedback, freshAttempt), titleRef);

  const canSelect = kind === 'select' && !submitting;
  function toggle(id: string) {
    if (!canSelect || foundIds.has(id)) return;
    setSelected((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : current.length < game.groupSize ? [...current, id] : current);
  }
  async function submit() {
    const action = connectionsGroupAction(canSelect, selected, game.groupSize);
    if (!action) return;
    // Con éxito, la selección se vacía antes de soltar «enviando»: no se puede reenviar el mismo grupo.
    await sendWithBusy(setSubmitting, () => onAction(action), () => setSelected([]));
  }
  async function advance() {
    await sendWithBusy(setAdvancing, () => onAction({ type: 'ADVANCE_ROUND' }));
  }

  const ownResult = lastRound?.players[selfId] ?? null;
  const ownFound = new Set(ownResult?.foundGroupIds ?? []);
  const playerCount = Object.keys(game.playerProgress).length;
  const bands = lastRound
    ? lastRound.groups.map((group, index) => {
      const finders = Object.values(lastRound.players).filter((entry) => entry.foundGroupIds.includes(group.id)).length;
      return <ConnectionsBand key={group.id} group={group} index={index} status={ownResult ? ownFound.has(group.id) ? 'found' : 'missed' : null} foundBy={`${finders} de ${playerCount} la encontraron`} />;
    })
    : foundGroups.map((group, index) => <ConnectionsBand key={group.id} group={group} index={index} status={null} />);
  const cards = lastRound ? [] : game.board.filter((pokemon) => !foundIds.has(pokemon.id));

  const roundMs = Math.max(1, (config?.roundSeconds ?? 120) * 1_000);
  const timer: GameTimer = game.phase === 'ROUND_ACTIVE'
    ? { deadline: game.roundEndsAt, serverOffset: offset, totalMs: roundMs, label: 'Tiempo' }
    : { deadline: lastRound ? game.nextTransitionAt : null, serverOffset: offset, label: 'Avance automático' };
  const meta = <>
    <span className={s.shape}><Chip tone="neutral" icon={<Icon icon={Puzzle} size={18} />}>{game.groupCount} grupos de {game.groupSize}</Chip></span>
    {lastRound && <Chip tone="info">Solución {lastRound.source === 'CURATED' ? 'curada' : 'generada'}</Chip>}
  </>;

  const clue = <div className={s.board}>
    <ConnectionsBoard groupSize={game.groupSize} groupCount={game.groupCount} bands={bands} cards={cards} selected={selected}
      onToggle={canSelect ? toggle : undefined} label={lastRound ? 'Solución del puzle' : `Tablero: elige ${game.groupSize} Pokémon que compartan algo`} />
  </div>;

  // El progreso (o la clasificación de la ronda) mide lo que necesita: no llena la columna.
  const side = lastRound
    ? <ConnectionsRoundBoard result={lastRound} groupCount={game.groupCount} members={members} colors={colors} selfId={selfId} className={GAME_SIDE_FIT} />
    : <ConnectionsProgress game={game} members={members} colors={colors} selfId={selfId} className={GAME_SIDE_FIT} />;

  const lastFound = feedback?.kind === 'CORRECT' ? foundGroups.find((group) => group.pokemon.some((pokemon) => feedback.attemptedPokemonIds.includes(pokemon.id))) ?? null : null;
  const announcement = connectionsAnnouncement({
    kind, roundNumber: game.roundNumber, groupSize: game.groupSize, player, foundLabel: lastFound?.label ?? null,
    found: kind === 'reveal' ? ownResult?.foundGroups ?? 0 : foundGroups.length, groupCount: game.groupCount,
  });
  const content = plateContent({
    kind, game, own, selected: selected.length, submitting, ownResult, host: room.hostId === selfId, advancing, remaining,
    onSubmit: () => void submit(), onAdvance: () => void advance(),
  });
  const bottom = <GuessPanel kind="waiting" titleRef={titleRef} question="" content={content} />;

  return <GameScreen gameName="Pokémon Connections" roundNumber={game.roundNumber} totalRounds={game.totalRounds} phase={game.phase} roundLabel={`Puzle ${game.roundNumber} de ${game.totalRounds}`}
    meta={meta} heading={lastRound ? 'Estas eran las conexiones' : 'Encuentra las conexiones'} timer={timer} announcement={announcement}
    clue={clue} side={side} bottom={bottom} testId="pokemon-connections-screen" />;
}

function plateContent({ kind, game, own, selected, submitting, ownResult, host, advancing, remaining, onSubmit, onAdvance }: {
  kind: ConnectionsPlateKind;
  game: PokemonConnectionsPublicState;
  own: Extract<PokemonConnectionsPlayerState, { role: 'PLAYER' }> | null;
  selected: number;
  submitting: boolean;
  ownResult: NonNullable<PokemonConnectionsPublicState['lastRound']>['players'][string] | null;
  host: boolean;
  advancing: boolean;
  remaining: number;
  onSubmit(): void;
  onAdvance(): void;
}): GuessPlateContent {
  const lives = own ? connectionsLivesText(own.mistakesUsed, own.mistakesAllowed) : '';
  switch (kind) {
    case 'select': {
      const feedback = own?.lastAttempt ?? null;
      const text = connectionsFeedbackText(feedback);
      const note = feedback && text
        ? <span data-testid="connections-feedback"><Chip tone={feedback.kind === 'CORRECT' ? 'ok' : feedback.nearMiss ? 'warn' : 'bad'} icon={<Icon icon={feedback.kind === 'CORRECT' ? CheckCircle2 : feedback.nearMiss ? Lightbulb : X} size={18} />}>{text}</Chip></span>
        : null;
      return {
        icon: MousePointerClick, tone: 'warn', kicker: `Tu selección · ${selected}/${game.groupSize}`, title: `Elige ${game.groupSize} que compartan algo`,
        text: <span className={s.plateNotes}>{note}<Chip tone="neutral" icon={<Icon icon={ShieldX} size={18} />}><span data-testid="connections-lives">{lives}</span></Chip></span>,
        aside: <Pill variant="yellow" icon={Check} loading={submitting} disabled={selected !== game.groupSize} onClick={onSubmit} className={s.submit}>Comprobar {selected}/{game.groupSize}</Pill>,
      };
    }
    case 'solved': return {
      icon: Trophy, tone: 'ok', kicker: `Tablero completado · ${own?.completionRank ?? '—'}.º`, title: '¡Todas las conexiones!',
      text: `Has conseguido ${own?.roundPoints ?? 0} puntos. Esperando al resto del grupo.`,
    };
    case 'eliminated': return {
      icon: ShieldX, tone: 'bad', kicker: lives, title: 'Ya no quedan intentos',
      text: `Has conseguido ${own?.roundPoints ?? 0} puntos. Tus grupos encontrados siguen arriba; la solución sale al terminar la ronda.`,
    };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'Espectador', title: 'Estás observando', text: 'El progreso se sincroniza, pero las soluciones de cada persona son privadas.' };
    case 'reveal': {
      const points = ownResult?.pointsAwarded ?? 0;
      const last = game.roundNumber >= game.totalRounds;
      return {
        icon: ownResult ? ownResult.status === 'SOLVED' ? CheckCircle2 : ShieldX : Eye,
        tone: ownResult ? ownResult.status === 'SOLVED' ? 'ok' : 'bad' : 'info',
        kicker: ownResult ? `Encontraste ${ownResult.foundGroups} de ${game.groupCount} grupos` : 'Estás observando',
        title: `${last ? 'Clasificación' : 'Siguiente puzle'} en ${Math.max(1, remaining)}s`,
        text: host ? 'Puedes avanzar ya.' : 'El host puede avanzar antes.',
        aside: <span className={s.revealAside}>
          {ownResult && <strong className={s.points}>{points > 0 && <ScorePop points={points} color="var(--ok)" placement="before" self />}+{points}<small> {points === 1 ? 'punto' : 'puntos'}</small></strong>}
          {host && <Pill variant="blue" icon={ArrowRight} loading={advancing} onClick={onAdvance}>{last ? 'Ver clasificación' : 'Siguiente puzle'}</Pill>}
        </span>,
      };
    }
    default: return { icon: Clock3, tone: 'info', kicker: 'Pokémon Connections', title: 'Preparando el puzle…', text: 'El servidor prepara el tablero.' };
  }
}
