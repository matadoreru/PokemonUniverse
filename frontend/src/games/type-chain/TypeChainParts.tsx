import type { RoomMemberView, TypeChainNode, TypeChainPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, CircleDashed, Gamepad2, Link2, Skull, TimerOff, Unplug, XCircle } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { ServerTimer } from '../../components/ServerTimer';
import { GameSkipSlot } from '../../room/GameSkipSlot';
import { guessSprite } from '../../room/guess-kit';
import { playerColor } from '../../room/player-color';
import { Badge, Card, Chip, cx, Icon, Panel, Row, TypeBadge } from '../../ui';
import { typeChainCooldownText, typeChainEliminationLabels, typeChainEventView, typeChainLinks, typeChainMemberStatus, typeChainReasonShort, typeChoiceText, typeLabel } from './presentation';
import s from './TypeChain.module.css';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const nameOf = (members: ReadonlyMap<string, RoomMemberView>, id: string) => members.get(id)?.displayName ?? 'Entrenador';

/**
 * Placa del turno (pantalla superior): turno, cadena y récord; de quién es el turno en texto con su color (la muestra
 * del color nunca va sola); a la derecha, «Saltar minijuego» y el plazo del turno (`Timer` del catálogo, que se pone
 * urgente en los 5 últimos segundos).
 */
export function TypeChainHud({ game, members, colors, selfId, timer }: {
  game: TypeChainPublicState;
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  timer: { deadline: number | null; serverOffset: number; totalMs: number };
}) {
  const current = game.currentPlayerId;
  const heading = !current ? 'Preparando la cadena…' : current === selfId ? '¡Tu turno!' : `Turno de ${nameOf(members, current)}`;
  const swatch = current ? ({ '--player': playerColor(colors.get(current) ?? 0) } as CSSProperties) : undefined;
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>Turno {game.turnNumber}</Badge>
        <span className={s.gameName}>Type Chain</span>
        <Chip tone="neutral" icon={<Icon icon={Link2} size={18} />}>Cadena {game.chainNumber} · {game.chain.length} Pokémon</Chip>
        <Chip tone="neutral">Récord {game.longestChain}</Chip>
      </div>
      <h1 className={cx(s.heading, 'ol')} title={heading}>
        {swatch && <span className={s.swatch} style={swatch} aria-hidden="true" />}
        <span className={s.headingText}>{heading}</span>
      </h1>
    </div>
    <div className={s.hudSide}>
      <GameSkipSlot className={s.skip} />
      {timer.deadline !== null && <div className={s.timer}><ServerTimer deadline={timer.deadline} serverOffset={timer.serverOffset} label="Turno" totalMs={timer.totalMs} /></div>}
    </div>
  </Panel>;
}

/**
 * El Pokémon actual (la pista): `Card` con su sprite, el nombre y sus tipos en `TypeBadge`; al lado, la regla con los
 * tipos que valen y la franja del último movimiento (continuó, eliminado o cadena nueva) en texto.
 */
export function TypeChainStage({ game, members }: { game: TypeChainPublicState; members: ReadonlyMap<string, RoomMemberView> }) {
  const current = game.chain.at(-1);
  const event = typeChainEventView(game.events.at(-1), (id) => nameOf(members, id));
  return <Panel variant="cream" as="section" aria-label="Pokémon actual" className={cx(s.stagePanel)} bodyClassName={cx(s.stage)}>
    {current
      ? <>
        <div className={s.currentCard} data-testid="type-chain-current">
          <Card size="fill" sprite={guessSprite(current.pokemon.sprite)} name={current.pokemon.name} decorativeSprite eager attrs={{ 'data-tc-card': 'current' }}>
            <span className={s.currentTypes}>{current.pokemon.types.map((type) => <TypeBadge key={type} type={type} label={typeLabel(type)} size="lg" />)}</span>
          </Card>
        </div>
        <div className={s.stageText}>
          <span className={s.kicker}>Pokémon actual</span>
          <p className={s.rule}>Busca uno que comparta <strong>exactamente un tipo</strong>: {typeChoiceText(current.pokemon.types)}.</p>
          <p className={s.ruleHelp}>Los Pokémon ya usados quedan bloqueados en toda la partida.</p>
        </div>
        {event && <div key={game.events.at(-1)!.at} className={cx(s.event, s[`event_${event.tone}`], 'motion-enter-up')} data-testid="type-chain-event">
          <Icon icon={event.tone === 'ok' ? CheckCircle2 : event.tone === 'bad' ? Skull : AlertTriangle} size={24} />
          <span className={s.eventText}><strong>{event.title}</strong><span>{event.text}</span></span>
        </div>}
      </>
      : <p className={s.rule}>El servidor está eligiendo el primer Pokémon…</p>}
  </Panel>;
}

/** Un eslabón de la cadena: sprite, nombre, tipos y, en texto, con qué tipo enlaza y quién lo puso. */
function ChainRow({ node, index, latest, members, colors }: { node: TypeChainNode; index: number; latest: boolean; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number> }) {
  const by = node.playedBy ? nameOf(members, node.playedBy) : null;
  return <li data-testid="type-chain-link" className={cx(latest && 'motion-enter-up')}>
    <Row rank={index + 1} name={node.pokemon.name} highlight={latest}
      {...(node.playedBy ? { color: playerColor(colors.get(node.playedBy) ?? 0) } : {})}
      avatar={<img src={guessSprite(node.pokemon.sprite)} alt="" className={s.chainSprite} loading="lazy" />}
      meta={<span className={s.chainMeta}>
        <span className={s.chainTypes}>{node.pokemon.types.map((type) => <TypeBadge key={type} type={type} label={typeLabel(type)} size="sm" />)}</span>
        <span className={s.chainBy}>{node.sharedType ? <>Enlaza por <strong>{typeLabel(node.sharedType)}</strong> · {by ?? 'Inicio'}</> : 'Inicio de la cadena'}</span>
        {latest && <Chip tone="info">Último</Chip>}
      </span>} />
  </li>;
}

/** La cadena entera (`Row`s, la última arriba) con desplazamiento interior. */
export function TypeChainChain({ game, members, colors, className }: { game: TypeChainPublicState; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; className?: string | undefined }) {
  const nodes = game.chain.map((node, index) => ({ node, index })).reverse();
  return <Panel title={`Cadena ${game.chainNumber}`} variant="dark" scroll scrollLabel="Cadena de Pokémon, el último arriba" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${game.chain.length} · récord ${game.longestChain}`}</Badge>}>
    <ol className={s.rows} aria-label="Eslabones de la cadena">{nodes.map(({ node, index }) => <ChainRow key={`${node.pokemon.id}-${node.turnNumber}`} node={node} index={index} latest={index === game.chain.length - 1 && index > 0} members={members} colors={colors} />)}</ol>
  </Panel>;
}

const STATUS_ICON: Record<'current' | 'next' | 'alive', LucideIcon> = { current: Gamepad2, next: CircleDashed, alive: CircleDashed };

/** Jugadores en su orden de turno: el color, el estado en texto (su turno, siguiente, eliminado y por qué) y sus eslabones. */
export function TypeChainPlayers({ game, members, colors, selfId, className }: { game: TypeChainPublicState; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  return <Panel title="Jugadores" variant="dark" scroll scrollLabel="Jugadores en orden de turno" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${game.activePlayerIds.length} en juego`}</Badge>}>
    <ol className={s.rows} aria-label="Orden de turno">{game.turnOrder.map((id) => {
      const member = members.get(id);
      const name = nameOf(members, id);
      const status = typeChainMemberStatus(game, id);
      const links = typeChainLinks(game, id);
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
          value={<span className={s.links}>{links}<small> {links === 1 ? 'eslabón' : 'eslabones'}</small></span>} />
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
      ? <p className={s.empty}>Todavía no hay fallos. Un intento que no vale cuesta {typeChainCooldownText} de espera.</p>
      : <ol className={s.rows} aria-label="Intentos fallidos">{attempts.map((attempt) => <li key={`${attempt.playerId}-${attempt.attemptedAt}`} data-testid="type-chain-attempt">
        <Row name={attempt.pokemon.name} color={playerColor(colors.get(attempt.playerId) ?? 0)}
          avatar={<img src={guessSprite(attempt.pokemon.sprite)} alt="" className={s.chainSprite} loading="lazy" />}
          meta={<span className={s.rowMeta}><span>{nameOf(members, attempt.playerId)} probó</span><Chip tone="bad" icon={<Icon icon={XCircle} size={18} />}>{typeChainReasonShort[attempt.reason]}</Chip></span>} />
      </li>)}</ol>}
  </Panel>;
}
