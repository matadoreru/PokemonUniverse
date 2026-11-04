import type { RoomView, WouldYouRatherConfig, WouldYouRatherOption, WouldYouRatherPlayerState, WouldYouRatherPublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Clock3, Eye, Lock, Scale, Send, Trophy, Users, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  WYR_OPTIONS, wouldYouRatherAnnouncement, wouldYouRatherCurrentStep, wouldYouRatherHeading, wouldYouRatherPlayerLine, wouldYouRatherRound,
  wouldYouRatherSteps, wouldYouRatherSummary, wouldYouRatherVerdict,
} from '../games/would-you-rather/presentation';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Chip, Icon, Pill } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { pointsWord } from './guess-kit';
import { ChoicePair, PhaseRail, ResponseProgress, SocialPlate, SocialScreen, VoteTally, socialFocusKey, type ChoiceOption, type TallyOption } from './social-kit';
import s from '../games/would-you-rather/WouldYouRather.module.css';

const GAME_NAME = 'Would You Rather Pokémon';

/**
 * Would You Rather con el kit social (spec §2 y §6 «Juegos»). Arriba: la placa de la ronda, las fases y el dilema como
 * dos cartas grandes enfrentadas (atajos 1 y 2) para elegir; al revelar, el recuento de cada opción con su barra y quién
 * la eligió. Abajo, la acción: la predicción de la mayoría y «Bloquear papeleta», la papeleta bloqueada o el veredicto con
 * los puntos. Al lado, quién ha enviado su papeleta (nunca el qué) o, al revelar, qué eligió y predijo cada uno.
 *
 * Privacidad: la papeleta propia solo vuelve en `ownBallot`; las de los demás solo en `lastRound`, que la pantalla lee
 * únicamente en `ROUND_RESULTS`.
 */
export function WouldYouRatherGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as WouldYouRatherPublicState;
  const player = room.gamePlayerState as WouldYouRatherPlayerState | null;
  const config = room.selectedGameConfig as Partial<WouldYouRatherConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const participating = player?.role === 'PLAYER';
  const active = game.phase === 'ROUND_ACTIVE';
  // La revelación (papeletas de todos) solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);
  const own = participating ? player.ownBallot : null;
  const locked = active && own !== null;

  // Elección local (preferencia y predicción) de esta ronda: empieza de cero en cada ronda.
  const [pick, setPick] = useState<{ round: number; preference: WouldYouRatherOption | null; prediction: WouldYouRatherOption | null }>({ round: game.roundNumber, preference: null, prediction: null });
  const current = pick.round === game.roundNumber ? pick : { round: game.roundNumber, preference: null, prediction: null };
  // Enviando en esta ronda: tras el éxito sigue así hasta que el servidor devuelve la papeleta (sin doble envío).
  const [busyRound, setBusyRound] = useState<number | null>(null);
  const busy = busyRound === game.roundNumber;
  const open = active && participating && player.canSubmit && !locked;

  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const nameOf = (id: string) => members.get(id)?.displayName ?? 'Entrenador';

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(socialFocusKey(game.phase, game.roundNumber, 1, locked), titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const timer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Para decidir', totalMs: config?.roundSeconds ? config.roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  const prompt = result?.prompt ?? game.prompt;
  const optionText = (id: WouldYouRatherOption) => (id === 'A' ? prompt.optionA : prompt.optionB);
  const choiceOption = (id: WouldYouRatherOption): ChoiceOption<WouldYouRatherOption> => ({ id, name: `Opción ${id}`, text: optionText(id), ariaLabel: `Opción ${id}: ${optionText(id)}` });
  const choiceOptions = [choiceOption('A'), choiceOption('B')] as const;
  const choose = (preference: WouldYouRatherOption) => setPick({ ...current, preference });
  const predict = (prediction: WouldYouRatherOption) => setPick({ ...current, prediction });

  const submit = async () => {
    if (!open || busy || !current.preference || !current.prediction) return;
    const round = game.roundNumber;
    setBusyRound(round);
    try {
      await onAction({ type: 'SUBMIT_BALLOT', preference: current.preference, prediction: current.prediction });
    } catch {
      // El fallo ya sale en el aviso global de la sala (un dueño por error): aquí solo se suelta el botón.
      setBusyRound((value) => (value === round ? null : value));
    }
  };

  const ownPreference = result?.players.find((entry) => entry.playerId === selfId)?.preference ?? null;
  const tallyOptions: TallyOption[] = WYR_OPTIONS.map((id) => ({ id, name: `Opción ${id}`, text: optionText(id), self: ownPreference === id }));
  const stage = result
    ? <VoteTally idBase="wyr-tally" title="Lo que eligió la sala" options={tallyOptions} rounds={wouldYouRatherRound(result)} winnerIds={result.majority ? [result.majority] : []}
      voterName={nameOf} winnerLabel="Mayoría" winnerIcon={Users} selfLabel="Tu elección" summary={wouldYouRatherSummary(result)} className={s.tally} />
    : <ChoicePair kicker={locked ? 'El dilema · Tu decisión (bloqueada)' : 'El dilema · Paso 1: tu decisión'} options={choiceOptions}
      value={own?.preference ?? current.preference} onChange={choose} disabled={!open || busy}
      help={open ? 'Elige con sinceridad. Predice con malicia. Atajos: 1 y 2.' : undefined}
      aside={own ? <Chip tone="ok" icon={<Icon icon={Lock} size={18} />}>Elegiste {own.preference}</Chip> : current.preference ? <Chip tone="info">Tu elección: {current.preference}</Chip> : null}
      className={s.choice} />;

  const side = result
    ? <ResponseProgress title="Puntos de la ronda" members={room.members} playerIds={game.playerIds} doneIds={[]} selfId={selfId} count={false}
      status={(id) => { const line = wouldYouRatherPlayerLine(result, id); return { ...line, ...(line.tone === 'bad' ? { icon: X } : {}) }; }}
      value={(id) => `+${result.players.find((entry) => entry.playerId === id)?.totalPoints ?? 0}`} />
    : <ResponseProgress title="Papeletas" members={room.members} playerIds={game.playerIds} doneIds={game.submittedPlayerIds} selfId={selfId}
      doneText="Lista" pendingText="Pensando…" note="Elección y predicción permanecen secretas hasta el resultado." />;

  let bottom;
  if (open) {
    const ready = current.preference !== null && current.prediction !== null;
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: Scale, tone: 'info', kicker: 'Paso 2 · Lee la sala', title: '¿Cuál será la mayoría?',
      text: 'Puedes predecir la misma opción que elegiste o la contraria. Acertarla vale 2 puntos.',
    }}>
      <div className={s.ballotRow}>
        <div className={s.predictions} role="group" aria-label="Tu predicción de la mayoría">
          {WYR_OPTIONS.map((id) => <Pill key={id} variant={current.prediction === id ? 'yellow' : 'cream'} aria-pressed={current.prediction === id} disabled={busy} onClick={() => predict(id)} className={s.prediction}>Mayoría {id}</Pill>)}
        </div>
        <p className={s.status}>{!current.preference ? 'Elige primero una opción arriba (1 o 2).' : !current.prediction ? `Elegiste ${current.preference}. Falta tu predicción.` : `Eliges ${current.preference} y predices ${current.prediction}.`}</p>
        <Pill variant="yellow" icon={Send} loading={busy} disabled={!ready} onClick={() => void submit()} className={s.confirm} data-testid="wyr-confirm">Bloquear papeleta</Pill>
      </div>
    </SocialPlate>;
  } else if (active && own) {
    bottom = <SocialPlate titleRef={titleRef} content={{
      icon: CheckCircle2, tone: 'ok', kicker: 'Tu papeleta', title: 'Papeleta bloqueada',
      text: <>Elegiste <strong>{own.preference}</strong> y predijiste <strong>{own.prediction}</strong>. Solo tú puedes verlo hasta el resultado.</>,
      aside: <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Enviada</Chip>,
    }} />;
  } else if (active && participating) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'warn', kicker: 'Papeleta cerrada', title: 'Se acabó el tiempo', text: 'Esta ronda ya no admite papeletas. Verás el resultado en un momento.' }} />;
  } else if (active) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Eye, tone: 'info', kicker: 'No votas en esta ronda', title: 'Estás observando', text: 'Verás qué eligió cada uno al final de la ronda.' }} />;
  } else if (result) {
    const verdict = wouldYouRatherVerdict(result, selfId, participating);
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: verdict.tone === 'ok' ? Trophy : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: `${last ? 'Clasificación' : 'Siguiente ronda'} en ${seconds}s`,
      text: verdict.detail,
      ...(verdict.points > 0 ? { aside: <strong className={s.points}>+{verdict.points}<small> {pointsWord(verdict.points)}</small></strong> } : {}),
    }} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando el resultado…', text: 'La ronda sigue en un momento.' }} />;
  }

  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={wouldYouRatherHeading(game.phase, result)} timer={timer}
    announcement={wouldYouRatherAnnouncement({ phase: game.phase, roundNumber: game.roundNumber, locked, result })}
    phases={<PhaseRail steps={wouldYouRatherSteps} current={wouldYouRatherCurrentStep(game.phase)} />} stage={stage} side={side} bottom={bottom} />;
}
