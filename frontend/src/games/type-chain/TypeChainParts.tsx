import type { RoomMemberView, TypeChainNode, TypeChainPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, CircleDashed, Gamepad2, Skull, TimerOff, Unplug, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { guessSprite } from '../../room/guess-kit';
import { playerColor } from '../../lib/player-color';
import { Badge, Chip, cx, Icon, Panel, Row, ScoreValue, StateBox, TypeBadge } from '../../ui';
import { typeChainCooldownText, typeChainEliminationLabels, typeChainEventView, typeChainMemberStatus, typeChainNamed, typeChainReasonShort, typeLabel } from './presentation';
import s from './TypeChain.module.css';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const nameOf = (members: ReadonlyMap<string, RoomMemberView>, id: string) => members.get(id)?.displayName ?? 'Entrenador';

/**
 * El tipo de la cadena (la pista): una `TypeBadge` grande en el hueco protagonista, con cuántos se llevan nombrados;
 * al lado, la regla en texto y la franja del último movimiento (nombró, eliminado o cadena nueva).
 */
export function TypeChainStage({ game, members }: { game: TypeChainPublicState; members: ReadonlyMap<string, RoomMemberView> }) {
  const event = typeChainEventView(game.events.at(-1), (id) => nameOf(members, id));
  const named = game.chain.length;
  return <Panel variant="cream" as="section" aria-label="Tipo de la cadena" className={cx(s.stagePanel)} bodyClassName={cx(s.stage)}>
    {game.chainType
      ? <>
        <div className={s.emblemSlot}>
          <div className={s.emblem} data-testid="type-chain-type">
            <span className={s.emblemKicker}>Cadena {game.chainNumber} · tipo</span>
            <TypeBadge type={game.chainType} label={typeLabel(game.chainType)} size="lg" />
            <span className={s.emblemCount}>{named === 0 ? 'Aún sin Pokémon' : `${named} ${named === 1 ? 'Pokémon nombrado' : 'Pokémon nombrados'}`}</span>
          </div>
        </div>
        <div className={s.stageText}>
          <span className={s.kicker}>La regla</span>
          <p className={s.rule}>Nombra un Pokémon de tipo <strong>{typeLabel(game.chainType)}</strong>, solo o con otro tipo.</p>
          <p className={s.ruleHelp}>Los ya nombrados quedan bloqueados en esta cadena. Gana quien más Pokémon nombre.</p>
        </div>
        {event && <div key={game.events.at(-1)!.at} className={cx(s.event, s[`event_${event.tone}`], 'motion-enter-up')} data-testid="type-chain-event">
          <Icon icon={event.tone === 'ok' ? CheckCircle2 : event.tone === 'bad' ? Skull : AlertTriangle} size={24} />
          <span className={s.eventText}><strong>{event.title}</strong><span>{event.text}</span></span>
        </div>}
      </>
      : <p className={s.rule}>El servidor está eligiendo el tipo de la cadena…</p>}
  </Panel>;
}

/** Un Pokémon de la cadena: sprite, nombre, tipos y, en texto, quién lo nombró. */
function ChainRow({ node, index, latest, members, colors }: { node: TypeChainNode; index: number; latest: boolean; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number> }) {
  return <li data-testid="type-chain-link" className={cx(latest && 'motion-enter-up')}>
    <Row rank={index + 1} name={node.pokemon.name} highlight={latest} color={playerColor(colors.get(node.playedBy) ?? 0)}
      avatar={<img src={guessSprite(node.pokemon.sprite)} alt="" className={s.chainSprite} loading="lazy" />}
      meta={<span className={s.chainMeta}>
        <span className={s.chainTypes}>{node.pokemon.types.map((type) => <TypeBadge key={type} type={type} label={typeLabel(type)} size="sm" />)}</span>
        <span className={s.chainBy}>Lo nombró <strong>{nameOf(members, node.playedBy)}</strong></span>
        {latest && <Chip tone="info">Último</Chip>}
      </span>} />
  </li>;
}

/** La cadena entera (`Row`s, el último arriba) con desplazamiento interior. */
export function TypeChainChain({ game, members, colors, className }: { game: TypeChainPublicState; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; className?: string | undefined }) {
  const nodes = game.chain.map((node, index) => ({ node, index })).reverse();
  return <Panel title={`Cadena ${game.chainNumber}`} variant="dark" scroll scrollLabel="Cadena de Pokémon, el último arriba" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${game.chain.length} · récord ${game.longestChain}`}</Badge>}>
    {nodes.length === 0 && <StateBox kind="empty" live={false} title="Cadena vacía" text="Nadie ha nombrado aún un Pokémon en esta cadena." />}
    <ol className={s.rows} aria-label="Pokémon de la cadena">{nodes.map(({ node, index }) => <ChainRow key={`${node.pokemon.id}-${node.turnNumber}`} node={node} index={index} latest={index === game.chain.length - 1} members={members} colors={colors} />)}</ol>
  </Panel>;
}

const STATUS_ICON: Record<'current' | 'next' | 'alive', LucideIcon> = { current: Gamepad2, next: CircleDashed, alive: CircleDashed };

/** Jugadores en su orden de turno: el color, el estado en texto (su turno, siguiente, eliminado y por qué) y los Pokémon que llevan nombrados en la partida. */
export function TypeChainPlayers({ game, members, colors, selfId, className }: { game: TypeChainPublicState; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  return <Panel title="Jugadores" variant="dark" scroll scrollLabel="Jugadores en orden de turno" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${game.activePlayerIds.length} en juego`}</Badge>}>
    <ol className={s.rows} aria-label="Orden de turno">{game.turnOrder.map((id) => {
      const member = members.get(id);
      const name = nameOf(members, id);
      const status = typeChainMemberStatus(game, id);
      const named = typeChainNamed(game, id);
      const chip: ReactNode = status.kind === 'eliminated'
        ? <><Chip tone="bad" icon={<Icon icon={status.reason === 'TIMEOUT' ? TimerOff : Unplug} size={18} />}>Eliminado</Chip><span className={s.reason}>{capitalize(typeChainEliminationLabels[status.reason])}</span></>
        : status.kind === 'current'
          ? <Chip tone="warn" icon={<Icon icon={STATUS_ICON.current} size={18} />}>Su turno</Chip>
          : status.kind === 'next'
            ? <Chip tone="info" icon={<Icon icon={STATUS_ICON.next} size={18} />}>Siguiente</Chip>
            : <Chip tone="neutral">Esperando</Chip>;
      return <li key={id} data-testid="type-chain-player" data-status={status.kind} aria-current={status.kind === 'current' ? 'step' : undefined}>
        <Row name={id === selfId ? `${name} (tú)` : name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} highlight={status.kind === 'current'}
          disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<span className={cx(status.kind === 'eliminated' && s.out)}><Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" /></span>}
          meta={<span className={s.rowMeta}>{chip}</span>}
          value={<ScoreValue value={named} self={id === selfId} color={playerColor(colors.get(id) ?? 0)} className={s.links}><small> {named === 1 ? 'nombrado' : 'nombrados'}</small></ScoreValue>} />
      </li>;
    })}</ol>
  </Panel>;
}

/** Intentos rechazados (públicos), el último arriba: quién, qué Pokémon y por qué no valió. */
export function TypeChainAttempts({ game, members, colors, className }: { game: TypeChainPublicState; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; className?: string | undefined }) {
  const attempts = game.invalidAttempts.slice().reverse();
  return <Panel title="Intentos fallidos" variant="dark" scroll scrollLabel="Intentos fallidos, el último arriba" {...(className ? { className } : {})}
    right={<Badge tone="cream">{String(attempts.length)}</Badge>}>
    {attempts.length === 0
      ? <StateBox kind="empty" live={false} title="Todavía no hay fallos." text={`Un intento que no vale cuesta ${typeChainCooldownText} de espera.`} />
      : <ol className={s.rows} aria-label="Intentos fallidos">{attempts.map((attempt) => <li key={`${attempt.playerId}-${attempt.attemptedAt}`} data-testid="type-chain-attempt">
        <Row name={attempt.pokemon.name} color={playerColor(colors.get(attempt.playerId) ?? 0)}
          avatar={<img src={guessSprite(attempt.pokemon.sprite)} alt="" className={s.chainSprite} loading="lazy" />}
          meta={<span className={s.rowMeta}><span>{nameOf(members, attempt.playerId)} probó</span><Chip tone="bad" icon={<Icon icon={XCircle} size={18} />}>{typeChainReasonShort[attempt.reason]}</Chip></span>} />
      </li>)}</ol>}
  </Panel>;
}
