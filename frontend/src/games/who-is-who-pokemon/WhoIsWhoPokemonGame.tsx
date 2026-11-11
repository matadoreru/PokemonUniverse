import type { WhoIsWhoPlayerState, WhoIsWhoPokemonConfig, WhoIsWhoPublicState } from '@pokemon-universe/shared/public';
import { Clock3, Eye, Hourglass, MessageCircleQuestion, Target, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useServerOffset } from '../../hooks/useServerTime';
import { Chip, cx, Pill } from '../../ui';
import {
  otherTeam, previousTurnGuess, secretsReady, TEAM_COLOR, TEAM_NAME, whoAnnouncement, whoFocusKey, whoHeading, whoRole, whoRoundLabel, type WhoRole,
} from './presentation';
import { WhoBoard, WhoGuessesFeed, WhoPickDialog, WhoSecretPanel, WhoTeamsPanel } from './WhoIsWhoParts';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { SocialPlate, SocialScreen, type SocialPlateContent } from '../../room/social-kit';
import { type ActiveGameProps, sendWithBusy } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './WhoIsWho.module.css';

const GAME_NAME = 'Quién es Quién';

/**
 * Quién es Quién Pokémon con el catálogo (spec §2 y §6 «Juegos»), en un único `SocialScreen`: arriba la placa
 * («Ronda N de M · Turno T», de quién es el turno y el plazo) y el tablero del equipo, con cartas que se bajan y se
 * levantan y los cursores de los compañeros; abajo, la acción con el turno en texto («Adivinar Pokémon», «Terminar
 * turno» o «Elegir nuestro Pokémon»); al lado, el secreto propio, los equipos y los intentos.
 *
 * Privacidad: el secreto solo llega en el estado propio del equipo dueño (`ownSecret`) y solo se pinta con él; las
 * cartas bajadas, igual (`discardedPokemonIds` es el del propio equipo). Los cursores van por su canal propio: moverse
 * no toca el aviso global. Los fallos de las acciones van al aviso global de la sala (no hay error local).
 */
export function WhoIsWhoPokemonGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as WhoIsWhoPublicState;
  const player = room.gamePlayerState as WhoIsWhoPlayerState | null;
  const config = room.selectedGameConfig as Partial<WhoIsWhoPokemonConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'guess' | 'secret' | null>(null);
  const { byId: members, colorIndex: colors, nameOf } = useRoomMembers(room);
  const ready = secretsReady(game);
  const role: WhoRole = whoRole(game, player);
  const team = player?.team ?? null;
  const discarded = team ? player?.discardedPokemonIds ?? [] : [];

  // Al cerrarse un intento aceptado (un fallo pasa el turno) «Adivinar» se deshabilita: el foco va al título de la placa.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(whoFocusKey(game, dialog !== null), titleRef);
  // Un diálogo abierto que ya no tiene sentido (se acabó el turno o ya hay secreto) se cierra.
  const canChoose = Boolean(player?.canChooseSecret);
  const canGuess = Boolean(player?.canGuess);
  useEffect(() => {
    if (dialog === 'guess' && !canGuess && !busy) setDialog(null);
    if (dialog === 'secret' && !canChoose && !busy) setDialog(null);
  }, [dialog, canGuess, canChoose, busy]);

  // «Adivinar» o «Terminar turno» con el foco que se deshabilitan (el turno pasa, el envío espera): el foco va al título
  // de la placa antes de que el navegador lo deje caer al `body`.
  const actionsRef = useRef<HTMLDivElement>(null);
  const canAct = Boolean(player?.canAct);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && active.disabled && actionsRef.current?.contains(active)) titleRef.current?.focus({ preventScroll: true });
  }, [canGuess, canAct, busy]);

  const send = (action: unknown): Promise<boolean> => sendWithBusy(setBusy, () => onAction(action));
  const toggle = (pokemonId: string) => { void onAction({ type: 'TOGGLE_DISCARD', pokemonId }).catch(() => undefined); };
  const confirm = async (pokemonId: string) => {
    const ok = await send(dialog === 'secret' ? { type: 'SELECT_SECRET', pokemonId } : { type: 'GUESS_POKEMON', pokemonId });
    if (ok) setDialog(null);
  };

  const heading = whoHeading(game, player);
  const timer = { deadline: game.roundEndsAt, serverOffset: offset, label: ready ? 'Turno' : 'Elegir secreto', totalMs: ready && config?.turnSeconds ? config.turnSeconds * 1_000 : config?.selectionSeconds ? config.selectionSeconds * 1_000 : undefined };
  const meta = ready && <Chip tone="warn" icon={<span className={s.teamDot} style={{ '--team': TEAM_COLOR[game.currentTeam] } as CSSProperties} aria-hidden="true" />}>
    {role === 'turn' ? 'Turno de tu equipo' : `Turno del ${TEAM_NAME[game.currentTeam]}`}
  </Chip>;

  const boardTitle = team ? `Tablero del ${TEAM_NAME[team]}` : 'Tablero';
  const stage = <WhoBoard cards={game.board} discardedIds={discarded} interactive={Boolean(player?.canManageBoard && team)} shareCursor={Boolean(team && player?.canManageBoard)}
    title={boardTitle} selfId={selfId} members={members} colors={colors} onToggle={toggle} />;

  const side = <div className={s.side}>
    {player?.ownSecret && team && <WhoSecretPanel secret={player.ownSecret} team={team} />}
    <WhoTeamsPanel game={game} ownTeam={team} members={members} colors={colors} selfId={selfId} />
    <WhoGuessesFeed guesses={game.guesses} board={game.board} members={members} colors={colors} className={s.feed} />
  </div>;

  const lastGuess = previousTurnGuess(game);
  const ownMiss = lastGuess && !lastGuess.correct && lastGuess.team === team ? lastGuess : null;
  let content: SocialPlateContent;
  if (!ready) {
    content = canChoose
      ? { icon: Target, tone: 'warn', kicker: 'Antes de empezar', title: 'Elegid vuestro Pokémon secreto', text: 'Cualquiera del equipo puede elegirlo; el otro equipo intentará descubrirlo.', aside: <Pill variant="yellow" icon={Target} disabled={busy} onClick={() => setDialog('secret')}>Elegir nuestro Pokémon</Pill> }
      : { icon: Hourglass, tone: 'info', kicker: 'Antes de empezar', title: 'Esperando los secretos', text: team ? 'Vuestro secreto ya está elegido. Falta el del otro equipo.' : 'Cada equipo elige su Pokémon secreto.' };
  } else if (role === 'watcher') {
    content = { icon: Eye, tone: 'info', kicker: `Turno ${game.turnNumber} · Observando`, title: `Pregunta el ${TEAM_NAME[game.currentTeam]}`, text: 'Los secretos y las cartas bajadas solo los ve cada equipo; se revelan al final.' };
  } else {
    const turnText = role === 'turn'
      ? `Preguntad al ${TEAM_NAME[otherTeam(game.currentTeam)]} por voz (sí o no) y bajad las cartas que no encajen. Un intento por turno: fallar pasa el turno.`
      : `El ${TEAM_NAME[game.currentTeam]} pregunta: responded por voz con sí o no. Podéis seguir bajando cartas.`;
    const missText = ownMiss ? `${ownMiss.playerId === selfId ? 'Tu' : 'Vuestro'} intento con ${game.board.find((pokemon) => pokemon.id === ownMiss.pokemonId)?.name ?? 'ese Pokémon'} no era: turno terminado. ` : '';
    content = {
      icon: ownMiss ? X : role === 'turn' ? MessageCircleQuestion : Clock3,
      tone: ownMiss ? 'bad' : role === 'turn' ? 'warn' : 'info',
      kicker: `Turno ${game.turnNumber} · ${role === 'turn' ? 'Tu equipo' : TEAM_NAME[game.currentTeam]}`,
      title: role === 'turn' ? (player?.guessUsed ? 'Ya habéis intentado adivinar' : 'Preguntad y bajad cartas') : 'Os toca responder',
      text: `${missText}${turnText}`,
      aside: <div className={s.actions} ref={actionsRef}>
        <Pill variant="yellow" icon={Target} disabled={!canGuess || busy} onClick={() => setDialog('guess')}>Adivinar Pokémon</Pill>
        {player?.canAct && <Pill variant="blue" disabled={busy} onClick={() => void send({ type: 'END_TURN' })}>Terminar turno</Pill>}
      </div>,
    };
  }
  const bottom = <SocialPlate titleRef={titleRef} content={content} className={s.plate} textClassName={ownMiss && ready ? s.plateMiss : s.plateHelp} />;

  return <>
    <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} phase={game.phase} totalRounds={game.totalRounds} roundLabel={whoRoundLabel(game)} heading={heading} meta={meta} timer={timer}
      announcement={whoAnnouncement({ game, player, nameOf })} stage={stage} side={side} bottom={bottom} className={cx(s.screen)} />
    <WhoPickDialog open={dialog !== null} mode={dialog ?? 'guess'} cards={game.board} discardedIds={discarded} busy={busy} epoch={game.turnNumber}
      onClose={() => setDialog(null)} onConfirm={(pokemonId) => void confirm(pokemonId)} />
  </>;
}
