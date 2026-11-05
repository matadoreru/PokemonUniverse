import type { PokedexDistanceConfig, PokedexDistancePlayerState, PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useRef } from 'react';
import { Check, Clock3, Crosshair, Eye, Hourglass, Lock, Ruler, Swords, Target, TimerOff, Trophy, UserX } from 'lucide-react';
import { RevealCutIn } from '../components/RevealCutIn';
import { Avatar } from '../components/Avatar';
import { ServerTimer } from '../components/ServerTimer';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { Badge, Card, Chip, cx, Icon, Panel, Row, ScreenSplit } from '../ui';
import { formatDexNumber } from './distance-ruler';
import { DexStrip } from './DexStrip';
import { DistanceRuler } from './DistanceRuler';
import { GameSkipSlot } from './GameSkipSlot';
import { useFocusOnTransition } from './focus-transition';
import { PlayerList } from './PlayerList';
import { playerColor } from './player-color';
import { PokemonSelector } from './PokemonSelector';
import { DISTANCE_EXACT_HIT_TITLE, distanceAnnouncement, distanceFocusKey, distancePickedCountText, distanceRoundOutcome, distanceRoundRows, distanceSpectatorHint } from './pokedex-distance-selection';
import s from './PokedexDistanceGame.module.css';

/** El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí no se repite. */
const ignoreFailure = () => undefined;

/**
 * Pokédex Distance (spec §2 y §6 «Juegos»). Arriba se mira: la placa con la ronda, el objetivo y el tiempo, quién ha
 * elegido y, al revelar, la regla. Abajo se actúa: el buscador o la elección bloqueada (y, al revelar, el veredicto con
 * el tiempo hasta la siguiente ronda). En la columna lateral, los jugadores de la ronda y, al revelar, sus distancias.
 */
export function PokedexDistanceGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokedexDistancePublicState;
  const playerState = room.gamePlayerState as PokedexDistancePlayerState | null;
  const config = room.selectedGameConfig as PokedexDistanceConfig;
  const { pokemon, loading: poolLoading, error: poolError, retry: retryPool } = usePokemonPool({ generations: config.generations });
  const serverOffset = useServerOffset(room.serverNow);
  const member = room.members.find((item) => item.id === selfId);
  const lastRound = game.lastRound;
  const revealing = game.phase === 'ROUND_RESULTS' && lastRound !== null;
  const outcome = lastRound ? distanceRoundOutcome(lastRound) : null;
  const activePhase = game.phase === 'ROUND_ACTIVE' || game.phase === 'TIEBREAKER_ACTIVE';
  const eligible = game.eligibleIds.includes(selfId);
  const hasSelection = Boolean(playerState?.selection);
  // Una ronda y sus desempates comparten `roundNumber`: la clave lleva también la profundidad.
  const roundKey = `${game.roundNumber}-${game.tiebreakDepth}`;
  const exactHitNow = activePhase && Boolean(playerState?.exactHit);
  useSfxCue('hit', exactHitNow ? roundKey : null);
  useSfxCue('reveal', game.phase === 'ROUND_RESULTS' ? roundKey : null);
  // Solo `selectedIds` (quién, nunca qué): con las elecciones ocultas no adelanta nada.
  const pickedCount = game.selectedIds.filter((id) => game.eligibleIds.includes(id)).length;
  const targetLabel = formatDexNumber(game.targetDexNumber ?? 0);
  const memberOf = (playerId: string) => room.members.find((item) => item.id === playerId);
  const colorOf = (playerId: string) => playerColor(Math.max(0, room.members.findIndex((item) => item.id === playerId)));
  // La elección propia sale del catálogo público del buscador (nombre y sprite, nunca el número).
  const ownPick = playerState?.selection ? pokemon.find((entry) => entry.id === playerState.selection!.pokemonId) ?? null : null;
  // Al bloquear la elección el buscador se desmonta y, al revelar, cambia la placa: el foco va a su título.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(distanceFocusKey(game.phase, roundKey, hasSelection), titleRef);
  const announcement = distanceAnnouncement({
    phase: game.phase, roundNumber: game.roundNumber, target: targetLabel, eligible, hasSelection,
    exactHit: Boolean(playerState?.exactHit), ownPickName: ownPick?.name ?? null, lastRound, selfId,
  });

  const hud = <Panel variant="dark" as="div" className={cx(s.hudPanel)} bodyClassName={cx(s.hud)}>
    <div className={s.round}>
      <Badge>Ronda {game.roundNumber}</Badge>
      {game.tiebreakDepth > 0 && <Chip tone="warn">Desempate {game.tiebreakDepth}</Chip>}
      <span className={s.points}><Icon icon={Trophy} size={18} />{member?.sessionPoints ?? 0} pts</span>
    </div>
    <div className={s.target}>
      <span className={s.targetIcon}><Icon icon={Target} size={32} /></span>
      <h2 className={s.targetTitle}>
        <span className={s.targetKicker}>Objetivo</span>
        <span className={cx(s.targetNumber, 'ol2')}>{targetLabel}</span>
      </h2>
    </div>
    <div className={s.timer}>
      {activePhase && <ServerTimer deadline={game.roundEndsAt} serverOffset={serverOffset} totalMs={config.roundSeconds * 1_000} label="Tiempo" />}
      {revealing && <ServerTimer deadline={game.nextTransitionAt} serverOffset={serverOffset} label="Siguiente ronda" />}
    </div>
  </Panel>;

  const picks = activePhase && <div className={s.picks}>
    <p className={s.pickCount} aria-live="polite">{distancePickedCountText(pickedCount, game.eligibleIds.length)}</p>
    <ul className={s.chips} aria-label="Quién ha elegido">{game.eligibleIds.map((playerId) => {
      const picked = game.selectedIds.includes(playerId);
      return <li key={playerId}><Chip tone={picked ? 'ok' : 'neutral'} icon={<Icon icon={picked ? Check : Hourglass} size={18} />}>
        <span className={s.chipName} title={memberOf(playerId)?.displayName ?? playerId}>{memberOf(playerId)?.displayName ?? playerId}</span>
        <span className="sr-only">{picked ? ': ya ha elegido' : ': eligiendo'}</span>
      </Chip></li>;
    })}</ul>
  </div>;

  const top = <div className={s.top}>
    {hud}
    {picks}
    {revealing
      ? <DistanceRuler round={lastRound} members={room.members} selfId={selfId} className={s.scene} />
      : <DexStrip target={game.targetDexNumber} generations={config.generations} className={s.scene} />}
    {!activePhase && !revealing && <p className={s.lead}>Elige el Pokémon cuyo número de Pokédex esté más cerca del objetivo: cae quien quede más lejos.</p>}
  </div>;

  const panel = revealing
    ? <Panel title="Resultado de la ronda" variant="dark" scroll scrollLabel="Distancias de la ronda" className={cx(s.sidePanel)}>
      <ul className={s.rows} aria-label="Distancias de la ronda">{distanceRoundRows(lastRound).map((row) => {
        const rowMember = memberOf(row.playerId);
        const name = rowMember?.displayName ?? row.playerId;
        const selection = lastRound.selections[row.playerId];
        return <li key={row.playerId}>
          <Row
            name={name}
            color={colorOf(row.playerId)}
            self={row.playerId === selfId}
            disconnected={rowMember?.presence !== undefined && rowMember.presence !== 'CONNECTED'}
            avatar={selection ? <img className={s.rowSprite} src={selection.sprite} alt="" /> : <Avatar name={name} avatar={rowMember?.avatar} level={rowMember?.level} size="sm" />}
            meta={<span className={s.rowMeta}>
              {selection ? <span className={s.clip}>{selection.pokemonName} · {formatDexNumber(selection.dexNumber)}</span> : <span className={s.strong}>Sin respuesta</span>}
              {row.eliminated && <Chip tone="bad" icon={<Icon icon={UserX} size={18} />}>Eliminado</Chip>}
              {row.tied && <Chip tone="warn">Empate</Chip>}
              {row.exact && <Chip tone="ok" icon={<Icon icon={Crosshair} size={18} />}>{DISTANCE_EXACT_HIT_TITLE}</Chip>}
            </span>}
            value={selection ? <span className={s.distance}><small>a </small>{selection.distance}</span> : <span className={s.distance}>—</span>}
          />
        </li>;
      })}</ul>
    </Panel>
    : <Panel title="En la ronda" variant="dark" scroll scrollLabel="Jugadores de la ronda" className={cx(s.sidePanel)} right={<Badge tone="cream">{`${game.survivorIds.length} siguen`}</Badge>}>
      <PlayerList members={room.members} game={game} selfId={selfId} />
    </Panel>;
  const side = <div className={s.side}>{panel}<GameSkipSlot className={s.skip} /></div>;

  const bottom = revealing
    ? <ActionStatus icon={lastRound.reason === 'NO_RESPONSE' ? TimerOff : lastRound.tiedIds.length > 0 ? Swords : Ruler} kicker={`Ronda ${game.roundNumber}${game.tiebreakDepth > 0 ? ` · desempate ${game.tiebreakDepth}` : ''}`} title={outcome!.title} text={outcome!.note ?? 'Cae quien quedó más lejos del objetivo.'} tone={outcome!.note ? 'warn' : 'info'} titleRef={titleRef} />
    : activePhase && eligible && !hasSelection
      ? <div className={s.selector}><PokemonSelector pokemon={pokemon} loading={poolLoading} loadError={poolError} onRetry={retryPool} locked={new Set(game.lockedPokemonIds)} disabled={false} onSelect={(pokemonId) => onAction({ type: 'SELECT_POKEMON', pokemonId }).catch(ignoreFailure)} /></div>
      : member?.role === 'SPECTATOR' || !eligible
        ? <ActionStatus icon={Eye} kicker="Sin elección esta ronda" title="Estás observando" text={distanceSpectatorHint(config.selectionVisibility)} tone="info" />
        : hasSelection
          ? <ActionStatus icon={playerState?.exactHit ? Crosshair : Lock} kicker={playerState?.exactHit ? 'Distancia 0' : 'Elección bloqueada'}
            title={playerState?.exactHit ? DISTANCE_EXACT_HIT_TITLE : '¡Selección confirmada!'}
            text={playerState?.exactHit ? 'Has elegido exactamente el Pokémon objetivo.' : 'Ya está bloqueada en el servidor.'}
            tone={playerState?.exactHit ? 'ok' : 'info'}
            titleRef={titleRef}
            aside={ownPick ? <span className={s.pick}><Card size="sm" name={ownPick.name} sprite={ownPick.sprite} decorativeSprite state={playerState?.exactHit ? 'correct' : 'selected'} /></span> : null} />
          : <ActionStatus icon={Clock3} kicker="Pokédex Distance" title="Siguiente ronda en breve…" text="El servidor prepara el próximo objetivo." tone="info" />;

  return <div className={cx('content-row', s.screen)}>
    {/* Primero: tras el armazón, su posición estática (absoluta, sin ancestro posicionado) alargaría la página en el móvil. */}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
    {exactHitNow && <RevealCutIn key={roundKey} tone="electric" title={DISTANCE_EXACT_HIT_TITLE} subtitle={targetLabel} />}
  </div>;
}

/** Pantalla inferior sin buscador: placa crema con icono, estado y, a la derecha, el tiempo o la carta elegida. */
function ActionStatus({ icon, kicker, title, text, tone, aside, titleRef }: { icon: LucideIcon; kicker: string; title: string; text: string; tone: 'ok' | 'info' | 'warn'; aside?: ReactNode; titleRef?: RefObject<HTMLHeadingElement | null> }) {
  return <Panel variant="cream" as="div" bodyClassName={cx(s.actionBody)}>
    <span className={cx(s.actionIcon, s[tone])}><Icon icon={icon} size={32} /></span>
    <div className={s.status}>
      <span className={s.kicker}>{kicker}</span>
      {/* Destino del foco (`useFocusOnTransition`): sin anillo, por la regla global de los títulos con tabindex -1. */}
      <h2 ref={titleRef} tabIndex={-1} className={s.actionTitle}>{title}</h2>
      <p className={s.help}>{text}</p>
    </div>
    {aside && <div className={s.aside}>{aside}</div>}
  </Panel>;
}

