import type { RoomView, TypeChainConfig, TypeChainPlayerState, TypeChainPublicState } from '@pokemon-universe/shared/public';
import { Clock3, Eye, Hourglass, Search, Skull, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { TypeChainAttempts, TypeChainChain, TypeChainHud, TypeChainPlayers, TypeChainStage } from '../games/type-chain/TypeChainParts';
import { chainTypeText, typeChainAnnouncement, typeChainEliminationLabels, typeChainFocusKey, typeChainPlateKind, typeChainReasonLabels, typeChainSearchAutoFocus, type TypeChainPlateKind } from '../games/type-chain/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { Chip, cx, Icon, ScreenSplit } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { GuessPanel, guessSeconds, type GuessPlateContent } from './guess-kit';
import s from '../games/type-chain/TypeChain.module.css';

/**
 * Type Chain (spec §2 y §6 «Juegos»). Cada cadena tiene un tipo fijo y, por turnos, cada jugador nombra un Pokémon de
 * ese tipo sin repetir. Arriba se mira: la placa del turno (de quién es, con su color, y el plazo), el tipo de la cadena
 * en una `TypeBadge` grande, la regla y el último movimiento; en escritorio, al lado, la cadena entera con
 * desplazamiento interior. Abajo se actúa: el buscador en tu turno (los usados bloqueados y el foco ya en el campo, para
 * escribir sin pulsar nada) o, si no, a quién se espera, o que observas. En la columna lateral, los jugadores en orden de turno (eliminados y por qué, en texto) y los
 * intentos fallidos. Una sola región viva dice el último movimiento, el turno y por qué no valió tu intento.
 *
 * No tiene revelación: el servidor encadena turnos (`TURN_ACTIVE`) hasta que queda uno (`GAME_RESULTS`). El fallo de
 * una orden lo dice el aviso global de la sala (el kit lo descarta con `ignoreFailure`).
 */
export function TypeChainGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as TypeChainPublicState;
  const player = room.gamePlayerState as TypeChainPlayerState | null;
  const config = room.selectedGameConfig as Partial<TypeChainConfig> | null;
  const { pokemon, error: poolError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: true });
  const offset = useServerOffset(room.serverNow);
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const used = useMemo(() => new Set(game.usedPokemonIds), [game.usedPokemonIds]);
  const nameOf = (id: string) => members.get(id)?.displayName ?? 'Entrenador';
  const spectator = members.get(selfId)?.role === 'SPECTATOR';
  const kind = typeChainPlateKind({ game, player, spectator });
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? null, offset);
  const chainType = chainTypeText(game.chainType);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(typeChainFocusKey(kind, game.turnNumber), titleRef);
  const lastEvent = game.events.at(-1);
  useSfxCue(lastEvent?.kind === 'SUCCESS' && lastEvent.playerId === selfId ? 'hit' : null, lastEvent?.at ?? null);
  useSfxCue(player?.lastAttempt ? 'miss' : null, player?.lastAttempt?.attemptedAt ?? null);

  const announcement = typeChainAnnouncement({ game, player, kind, nameOf });
  const ownElimination = game.eliminations.find((entry) => entry.playerId === selfId);
  const lastAttempt = kind === 'turn' && player?.lastAttempt && (game.turnStartedAt === null || player.lastAttempt.attemptedAt >= game.turnStartedAt) ? player.lastAttempt : null;
  const content = plateContent({ kind, game, chainType, nameOf, cooldownMs, lastAttempt, eliminatedReason: ownElimination?.reason ?? null });

  const top = <div className={s.top}>
    <TypeChainHud game={game} members={members} colors={colors} selfId={selfId} timer={{ deadline: game.roundEndsAt, serverOffset: offset, totalMs: (config?.turnSeconds ?? 15) * 1_000 }} />
    <div className={s.board}>
      <TypeChainStage game={game} members={members} />
      <TypeChainChain game={game} members={members} colors={colors} className={s.chainPanel} />
    </div>
  </div>;
  const side = <div className={s.side}>
    <TypeChainPlayers game={game} members={members} colors={colors} selfId={selfId} className={s.playersPanel} />
    <TypeChainAttempts game={game} members={members} colors={colors} className={s.attemptsPanel} />
  </div>;
  const bottom = <GuessPanel kind={kind === 'turn' ? 'guess' : 'waiting'} titleRef={titleRef} question="" content={content} cooldownMs={cooldownMs}
    selector={{
      pokemon, loading: poolLoading, loadError: poolError, onRetry: retryPool, locked: used, roundKey: game.turnNumber,
      // El buscador se monta de nuevo en cada turno propio (`roundKey`): con el foco en el campo se escribe directamente.
      autoFocus: typeChainSearchAutoFocus(kind),
      inputLabel: `Buscar Pokémon de tipo ${chainType}`,
      onGuess: (pokemonId) => onAction({ type: 'SUBMIT_POKEMON', pokemonId }),
    }} />;

  return <div className={cx('content-row', s.screen)} data-testid="type-chain-screen">
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
  </div>;
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
