import type { TypeChainConfig, TypeChainPlayerState, TypeChainPublicState } from '@pokemon-universe/shared/public';
import { Clock3, Eye, Hourglass, Link2, Search, Skull, X } from 'lucide-react';
import { useMemo, useRef, type CSSProperties } from 'react';
import { TypeChainAttempts, TypeChainChain, TypeChainPlayers, TypeChainStage } from './TypeChainParts';
import { playerColor } from '../../lib/player-color';
import { chainTypeText, typeLabel, typeChainAnnouncement, typeChainEliminationLabels, typeChainFocusKey, typeChainPlateKind, typeChainReasonLabels, typeChainSearchAutoFocus, type TypeChainPlateKind } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../../hooks/useServerTime';
import { useOutcomeCue } from '../../room/game-kit/useOutcomeCue';
import { roomTurnKey, useTurnCue } from '../../room/game-kit/useTurnCue';
import { GameScreen } from '../../room/game-kit/GameScreen';
import { Chip, Icon } from '../../ui';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { GuessPanel, guessSeconds, type GuessPlateContent } from '../../room/guess-kit';
import type { ActiveGameProps } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './TypeChain.module.css';

/**
 * Type Chain (spec §2 y §6 «Juegos»), en el marco de juego (`GameScreen`). Cada cadena tiene un tipo fijo y, por turnos, cada jugador nombra un Pokémon de
 * ese tipo sin repetir. Arriba se mira: la placa del turno (de quién es, con su color, y el plazo), el tipo de la cadena
 * en una `TypeBadge` grande, la regla y el último movimiento; en escritorio, al lado, la cadena entera con
 * desplazamiento interior. Abajo se actúa: el buscador en tu turno (los usados bloqueados y el foco ya en el campo, para
 * escribir sin pulsar nada) o, si no, a quién se espera, o que observas. En la columna lateral, los jugadores en orden de turno (eliminados y por qué, en texto) y los
 * intentos fallidos. Una sola región viva dice el último movimiento, el turno y por qué no valió tu intento.
 *
 * No tiene revelación: el servidor encadena turnos (`TURN_ACTIVE`) hasta que queda uno (`GAME_RESULTS`). El fallo de
 * una orden lo dice el aviso global de la sala (el kit lo descarta con `ignoreFailure`).
 */
export function TypeChainGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as TypeChainPublicState;
  const player = room.gamePlayerState as TypeChainPlayerState | null;
  const config = room.selectedGameConfig as Partial<TypeChainConfig> | null;
  const { pokemon, error: poolError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: true });
  const offset = useServerOffset(room.serverNow);
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const used = useMemo(() => new Set(game.usedPokemonIds), [game.usedPokemonIds]);
  const nameOf = (id: string) => members.get(id)?.displayName ?? 'Entrenador';
  const spectator = members.get(selfId)?.role === 'SPECTATOR';
  const kind = typeChainPlateKind({ game, player, spectator });
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? null, offset);
  const chainType = chainTypeText(game.chainType);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(typeChainFocusKey(kind, game.turnNumber), titleRef);
  const lastEvent = game.events.at(-1);
  useOutcomeCue(lastEvent?.kind === 'SUCCESS' && lastEvent.playerId === selfId ? true : null, lastEvent?.at);
  useOutcomeCue(player?.lastAttempt ? false : null, player?.lastAttempt?.attemptedAt);

  // «¡Te toca!» al empezar tu turno: suena, rebota la placa y sale el cut-in corto (el foco ya está en el buscador).
  const turnCue = useTurnCue(kind === 'turn', roomTurnKey(room, game.turnNumber));
  const announcement = typeChainAnnouncement({ game, player, kind, nameOf });
  const ownElimination = game.eliminations.find((entry) => entry.playerId === selfId);
  const lastAttempt = kind === 'turn' && player?.lastAttempt && (game.turnStartedAt === null || player.lastAttempt.attemptedAt >= game.turnStartedAt) ? player.lastAttempt : null;
  const content = plateContent({ kind, game, chainType, nameOf, cooldownMs, lastAttempt, eliminatedReason: ownElimination?.reason ?? null });

  // Placa del turno: turno, cadena y récord; de quién es el turno en texto con su color (la muestra nunca va sola).
  const current = game.currentPlayerId;
  const heading = !current ? 'Preparando la cadena…' : current === selfId ? '¡Tu turno!' : `Turno de ${nameOf(current)}`;
  const swatch = current ? <span className={s.swatch} style={{ '--player': playerColor(colors.get(current) ?? 0) } as CSSProperties} /> : null;
  const meta = <>
    <Chip tone="neutral" icon={<Icon icon={Link2} size={18} />}>{`Cadena ${game.chainNumber}${game.chainType ? ` · ${typeLabel(game.chainType)}` : ''} · ${game.chain.length} Pokémon`}</Chip>
    {/* En el móvil el récord ya va en la cadena. */}
    <span className={s.record}><Chip tone="neutral">Récord {game.longestChain}</Chip></span>
  </>;
  const board = <div className={s.board}>
    <TypeChainStage game={game} members={members} />
    <TypeChainChain game={game} members={members} colors={colors} className={s.chainPanel} />
  </div>;
  // Los jugadores miden lo que necesitan (con tope) y los fallos llenan el resto.
  const side = <>
    <TypeChainPlayers game={game} members={members} colors={colors} selfId={selfId} />
    <TypeChainAttempts game={game} members={members} colors={colors} />
  </>;
  const bottom = <GuessPanel kind={kind === 'turn' ? 'guess' : 'waiting'} titleRef={titleRef} question="" content={content} cooldownMs={cooldownMs}
    selector={{
      pokemon, loading: poolLoading, loadError: poolError, onRetry: retryPool, locked: used, roundKey: game.turnNumber,
      // El buscador se monta de nuevo en cada turno propio (`roundKey`): con el foco en el campo se escribe directamente.
      autoFocus: typeChainSearchAutoFocus(kind),
      inputLabel: `Buscar Pokémon de tipo ${chainType}`,
      onGuess: (pokemonId) => onAction({ type: 'SUBMIT_POKEMON', pokemonId }),
    }} />;

  // La pista entra de nuevo con cada cadena (no en cada turno): la clave es el número de cadena.
  return <GameScreen gameName="Type Chain" roundNumber={game.chainNumber} totalRounds={0} phase={game.phase} roundLabel={`Turno ${game.turnNumber}`} meta={meta}
    heading={heading} headingMark={swatch} timer={{ deadline: game.roundEndsAt, serverOffset: offset, totalMs: (config?.turnSeconds ?? 15) * 1_000, label: 'Turno' }}
    announcement={announcement} clue={board} side={side} bottom={bottom} testId="type-chain-screen" turnCue={turnCue} />;
}

function plateContent({ kind, game, chainType, nameOf, cooldownMs, lastAttempt, eliminatedReason }: {
  kind: TypeChainPlateKind;
  game: TypeChainPublicState;
  chainType: string;
  nameOf(id: string): string;
  cooldownMs: number;
  lastAttempt: TypeChainPlayerState['lastAttempt'];
  eliminatedReason: 'TIMEOUT' | 'DISCONNECTED' | null;
}): GuessPlateContent {
  const next = game.nextPlayerId ? `Después: ${nameOf(game.nextPlayerId)}.` : '';
  switch (kind) {
    case 'turn': return {
      icon: Search, tone: 'warn', kicker: 'Tu turno', title: `Nombra un Pokémon de tipo ${chainType}`,
      text: 'Vale si es uno de sus tipos. Los ya nombrados en esta cadena no se pueden elegir.',
      // La espera tras un fallo se ve aquí (la región viva ya la anuncia); después, por qué no valió.
      aside: cooldownMs > 0
        ? <span aria-hidden="true" data-testid="type-chain-cooldown"><Chip tone="warn" icon={<Icon icon={Hourglass} size={18} />}>Nuevo intento en {guessSeconds(cooldownMs)}</Chip></span>
        : lastAttempt ? <span data-testid="type-chain-reason"><Chip tone="bad" icon={<Icon icon={X} size={18} />}>{lastAttempt.pokemonName}: {typeChainReasonLabels[lastAttempt.reason]}</Chip></span> : undefined,
    };
    case 'waiting': return { icon: Clock3, tone: 'info', kicker: game.currentPlayerId ? `Turno de ${nameOf(game.currentPlayerId)}` : 'Esperando', title: `Esperando a ${game.currentPlayerId ? nameOf(game.currentPlayerId) : 'otro jugador'}…`, text: `El buscador aparece solo en tu turno. ${next}`.trim() };
    case 'eliminated': return { icon: Skull, tone: 'bad', kicker: eliminatedReason ? `Eliminado: ${typeChainEliminationLabels[eliminatedReason]}` : 'Eliminado', title: 'Observas la cadena', text: 'Puedes seguir toda la partida hasta el final.' };
    case 'spectator': return { icon: Eye, tone: 'info', kicker: 'Espectador', title: 'Observas la cadena', text: 'Los espectadores no juegan turnos: la cadena y los fallos se ven en directo.' };
    default: return { icon: Clock3, tone: 'info', kicker: 'Type Chain', title: 'Preparando la cadena…', text: 'El servidor elige el tipo de la cadena.' };
  }
}
