import type { RoomMemberView, WhoIsWhoCursorEvent, WhoIsWhoGuess, WhoIsWhoPokemonCard, WhoIsWhoPublicState, WhoIsWhoTeam } from '@pokemon-universe/shared/public';
import { Check, EyeOff, Flag, LockKeyhole, MousePointer2, Search, Target, X } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { Avatar } from '../../components/Avatar';
import { clearWhoIsWhoCursor, sendWhoIsWhoCursor, subscribeWhoIsWhoCursors } from '../../room/who-is-who-cursor-channel';
import { normalizeBoardPointer, projectBoardCursor } from '../../room/who-is-who-cursor-position';
import { useRefocusAfterReject } from '../../room/focus-transition';
import { playerColor } from '../../room/player-color';
import { searchPokemonOptions } from '../../room/pokemon-search';
import { Badge, Card, Chip, cx, Dialog, Field, Icon, Panel, Pill, Row, StateBox } from '../../ui';
import { boardLayout, boardMove, CARD_RATIO, cursorLabel, downCountText, TEAM_COLOR, TEAM_NAME, teamStatus, type BoardLayout } from './presentation';
import s from './WhoIsWho.module.css';

const BOARD_GAP = 8;
/** A partir de este ancho de carta el nombre va a 15 px (si no, a 13). */
const LARGE_CARD = 128;

/**
 * Mide el hueco del cuerpo del panel (sin su relleno) y calcula la disposición del tablero; se rehace al cambiar de
 * tamaño. Sin medir aún (o sin `ResizeObserver`), `null`: el CSS pone una rejilla de reserva.
 */
function useBoardLayout(ref: RefObject<HTMLElement | null>, count: number): BoardLayout | null {
  const [layout, setLayout] = useState<BoardLayout | null>(null);
  useLayoutEffect(() => {
    const body = ref.current?.parentElement;
    if (!body || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const style = getComputedStyle(body);
      const width = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const next = boardLayout(count, width, height, BOARD_GAP);
      setLayout((current) => (current && current.columns === next.columns && current.card === next.card && current.fits === next.fits ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [ref, count]);
  return layout;
}

/**
 * Cursores de los compañeros sobre el tablero (llegan por su canal propio, nunca por el aviso global): una flecha con el
 * color del jugador y su nombre. Es una capa sin puntero (`pointer-events: none`, `data-layer`), así que no bloquea las
 * cartas ni los controles; se mueve con `transform` y, con movimiento reducido o `body.static`, salta sin transición.
 * La etiqueta va encima de la punta (fuera de la franja del nombre de la carta) y se apaga a los 1,5 s sin moverse:
 * queda la flecha de color. Un cursor quieto 4 s desaparece.
 */
function TeamCursors({ boardRef, selfId, members, colors }: { boardRef: RefObject<HTMLDivElement | null>; selfId: string; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number> }) {
  const [cursors, setCursors] = useState<Record<string, WhoIsWhoCursorEvent>>({});
  // Hora local de llegada de cada cursor (no la del servidor: así un reloj desfasado no apaga la etiqueta).
  const receivedRef = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());
  const [, redraw] = useState(0);
  useEffect(() => subscribeWhoIsWhoCursors((message) => {
    if (message.type === 'RESET') { receivedRef.current.clear(); setCursors({}); return; }
    if (message.type === 'CLEAR') { receivedRef.current.delete(message.playerId); setCursors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== message.playerId))); return; }
    if (message.cursor.playerId === selfId) return;
    const at = Date.now();
    receivedRef.current.set(message.cursor.playerId, at);
    setNow(at);
    setCursors((current) => ({ ...current, [message.cursor.playerId]: message.cursor }));
  }), [selfId]);
  const active = Object.keys(cursors).length > 0;
  useEffect(() => {
    const resize = () => redraw((value) => value + 1);
    window.addEventListener('resize', resize);
    const timer = window.setInterval(() => {
      const at = Date.now();
      if (active) setNow(at);
      const cutoff = at - 4_000;
      setCursors((current) => {
        const kept = Object.entries(current).filter(([id]) => (receivedRef.current.get(id) ?? 0) >= cutoff);
        return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
      });
    }, 500);
    return () => { window.removeEventListener('resize', resize); window.clearInterval(timer); };
  }, [active]);
  const board = boardRef.current;
  const rect = board?.getBoundingClientRect();
  return <div className={s.cursors} aria-hidden="true" data-layer="team-cursors" data-testid="who-cursors">{rect && board && Object.values(cursors).map((cursor) => {
    const card = cursor.pokemonId ? Array.from(board.querySelectorAll<HTMLElement>('[data-pokemon-id]')).find((element) => element.dataset.pokemonId === cursor.pokemonId) : undefined;
    const cardRect = card?.getBoundingClientRect();
    const position = projectBoardCursor(cursor, rect.width, rect.height, 8, cardRect ? { left: cardRect.left - rect.left, top: cardRect.top - rect.top, width: cardRect.width, height: cardRect.height } : undefined);
    const label = cursorLabel(position.top, now - (receivedRef.current.get(cursor.playerId) ?? now));
    const name = members.get(cursor.playerId)?.displayName ?? 'Compañero';
    const style = { transform: `translate(${position.left}px, ${position.top}px)`, '--player': playerColor(colors.get(cursor.playerId) ?? 0) } as CSSProperties;
    return <span key={cursor.playerId} className={s.cursor} style={style} data-testid="who-cursor" data-player={name}>
      <Icon icon={MousePointer2} size={24} className={s.cursorArrow} />
      <span className={cx(s.cursorName, label.beside ? s.beside : s.above, position.labelLeft && s.left, label.quiet && s.quiet)} {...(label.top !== null ? { style: { top: label.top } } : {})} data-testid="who-cursor-name" data-quiet={label.quiet ? 'true' : 'false'}>{name}</span>
    </span>;
  })}</div>;
}

export interface WhoBoardProps {
  cards: readonly WhoIsWhoPokemonCard[];
  /** Cartas bajadas del propio equipo (vacío para quien observa: el motor no envía las de nadie más). */
  discardedIds: readonly string[];
  /** Se puede bajar y levantar (jugador con los secretos listos). */
  interactive: boolean;
  /** Muestra los cursores del equipo y envía el propio. */
  shareCursor: boolean;
  title: string;
  selfId: string;
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  onToggle(pokemonId: string): void;
  className?: string | undefined;
}

/**
 * Tablero del equipo: un `Panel` con una rejilla de `Card`s que se bajan y se levantan (conmutadores con `aria-pressed`
 * y la marca «Bajada» escrita: no solo atenuadas). Foco itinerante: una sola carta en el orden de tabulación y las
 * flechas, Inicio y Fin se mueven por la rejilla; Espacio o Intro la baja o la levanta. Las cartas crecen con el hueco
 * (a 1920 llenan la pantalla); si no caben con el tamaño mínimo, el tablero se desplaza dentro de su panel.
 */
export const WhoBoard = memo(function WhoBoard({ cards, discardedIds, interactive, shareCursor, title, selfId, members, colors, onToggle, className }: WhoBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const pendingRef = useRef<Parameters<typeof sendWhoIsWhoCursor>[0] | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const layout = useBoardLayout(boardRef, cards.length);
  const down = useMemo(() => new Set(discardedIds), [discardedIds]);
  const downCount = cards.filter((pokemon) => down.has(pokemon.id)).length;

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    if (shareCursor) clearWhoIsWhoCursor();
  }, [shareCursor]);

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!shareCursor || !boardRef.current) return;
    if (leaveTimerRef.current !== null) { window.clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    const position = normalizeBoardPointer(event.clientX, event.clientY, boardRef.current.getBoundingClientRect());
    if (!position) return;
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pokemon-id]') : null;
    const cardRect = card?.getBoundingClientRect();
    pendingRef.current = card?.dataset.pokemonId && cardRect && cardRect.width > 0 && cardRect.height > 0
      ? { ...position, pokemonId: card.dataset.pokemonId, cardX: Math.min(1, Math.max(0, (event.clientX - cardRect.left) / cardRect.width)), cardY: Math.min(1, Math.max(0, (event.clientY - cardRect.top) / cardRect.height)) }
      : position;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame((now) => {
      frameRef.current = null;
      if (!pendingRef.current || now - lastSentRef.current < 40) return;
      lastSentRef.current = now;
      sendWhoIsWhoCursor(pendingRef.current);
    });
  };
  const pointerLeave = () => { if (shareCursor) leaveTimerRef.current = window.setTimeout(clearWhoIsWhoCursor, 500); };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const buttons = Array.from(boardRef.current?.querySelectorAll<HTMLButtonElement>('button[data-pokemon-id]') ?? []);
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const next = boardMove(index, event.key, layout?.columns ?? columnsOf(buttons), buttons.length);
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    buttons[next]?.focus();
  };
  const onFocus = (event: { target: EventTarget }) => {
    const id = event.target instanceof HTMLElement ? event.target.dataset.pokemonId : undefined;
    const index = id ? cards.findIndex((pokemon) => pokemon.id === id) : -1;
    if (index >= 0) setFocusIndex(index);
  };
  const roving = Math.min(focusIndex, cards.length - 1);
  const gridStyle = layout ? ({ gridTemplateColumns: `repeat(${layout.columns}, ${layout.card}px)`, gridAutoRows: `${Math.floor(layout.card * CARD_RATIO)}px`, gap: BOARD_GAP } as CSSProperties) : undefined;

  return <Panel title={title} variant="cream" scroll scrollLabel={title} className={cx(s.boardPanel, className)} bodyClassName={cx(s.boardBody)}
    right={<Badge tone="navy">{downCountText(downCount, cards.length)}</Badge>}>
    <div ref={boardRef} className={cx(s.board, layout?.fits && s.fits)} onPointerMove={pointerMove} onPointerLeave={pointerLeave}>
      <div className={cx(s.grid, !layout && s.gridFallback, layout && layout.card >= LARGE_CARD && s.large)} style={gridStyle} role="group" aria-label={interactive ? `${title}: baja o levanta cartas con las flechas y Espacio` : title}
        onKeyDown={onKeyDown} onFocus={onFocus} data-testid="who-board" data-columns={layout?.columns} data-card={layout?.card}>
        {cards.map((pokemon, index) => {
          const isDown = down.has(pokemon.id);
          return <Card key={pokemon.id} size="fill" sprite={pokemon.sprite} name={pokemon.name} decorativeSprite state={isDown && interactive ? 'selected' : 'idle'}
            attrs={{ 'data-pokemon-id': pokemon.id, 'data-down': isDown ? 'true' : 'false', ...(interactive ? { 'aria-label': `Bajar ${pokemon.name}`, tabIndex: index === roving ? 0 : -1 } : {}) }}
            {...(interactive ? { onSelect: () => onToggle(pokemon.id) } : {})}>
            {isDown && <span className={s.downTag}><Icon icon={EyeOff} size={18} />Bajada</span>}
          </Card>;
        })}
      </div>
      {shareCursor && <TeamCursors boardRef={boardRef} selfId={selfId} members={members} colors={colors} />}
    </div>
  </Panel>;
});

/** Columnas reales de la rejilla (antes de medir): las cartas de la primera fila. */
function columnsOf(buttons: readonly HTMLElement[]): number {
  const top = buttons[0]?.offsetTop;
  let columns = 0;
  while (columns < buttons.length && buttons[columns]!.offsetTop === top) columns++;
  return Math.max(1, columns);
}

/**
 * Pokémon secreto del propio equipo (columna lateral). Solo se monta con `ownSecret`, que el servidor manda únicamente
 * al equipo dueño: el rival y quien observa no lo tienen ni en el DOM.
 */
export function WhoSecretPanel({ secret, team, className }: { secret: WhoIsWhoPokemonCard; team: WhoIsWhoTeam; className?: string | undefined }) {
  return <div className={cx(s.secretWrap, className)} data-testid="who-secret">
    <Panel title="Vuestro secreto" variant="cream" bodyClassName={cx(s.secretBody)} right={<Badge tone="navy">Secreto</Badge>}>
      <Card size="sm" sprite={secret.sprite} name={secret.name} number={secret.nationalDexNumber} decorativeSprite eager />
      <p className={s.secretText}>
        <span className={s.teamDot} style={{ '--team': TEAM_COLOR[team] } as CSSProperties} aria-hidden="true" />
        Solo lo ve el {TEAM_NAME[team]}. El otro equipo intenta descubrirlo con preguntas de sí o no.
      </p>
    </Panel>
  </div>;
}

/** Equipos (columna lateral): cada uno con su color y nombre, su estado en texto (turno, secreto) y sus jugadores. */
export function WhoTeamsPanel({ game, ownTeam, members, colors, selfId, className }: { game: WhoIsWhoPublicState; ownTeam: WhoIsWhoTeam | null; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  const order: WhoIsWhoTeam[] = ownTeam === 'RED' ? ['RED', 'BLUE'] : ['BLUE', 'RED'];
  return <Panel title="Equipos" variant="dark" scroll scrollLabel="Equipos de la partida" className={cx(s.teamsPanel, className)}>
    <div className={s.teams}>{order.map((team) => {
      const status = teamStatus(game, team);
      const ids = game.teams[team].playerIds;
      return <section key={team} className={s.team} aria-label={TEAM_NAME[team]} data-testid={`who-team-${team}`} style={{ '--team': TEAM_COLOR[team] } as CSSProperties}>
        <h3 className={s.teamHead}>
          <Icon icon={Flag} size={18} className={s.teamFlag} />
          <span className={s.teamName}>{TEAM_NAME[team]}</span>
          {team === ownTeam && <Badge tone="cream">Tu equipo</Badge>}
          <Chip tone={status.tone} {...(status.tone === 'warn' ? { icon: <Icon icon={Target} size={18} /> } : {})}>{status.text}</Chip>
        </h3>
        <ul className={s.rows} aria-label={`Jugadores del ${TEAM_NAME[team]}`}>{ids.map((id) => {
          const member = members.get(id);
          const name = member?.displayName ?? 'Entrenador';
          return <li key={id}><Row name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'} avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />} /></li>;
        })}</ul>
      </section>;
    })}</div>
  </Panel>;
}

/**
 * Intentos de adivinar de la partida (columna lateral), el último arriba: el Pokémon, quién lo probó, de qué equipo y
 * en qué turno, y si acertó. El vacío enseña a jugar y no es región viva (la pantalla ya tiene la suya).
 */
export function WhoGuessesFeed({ guesses, board, members, colors, className }: { guesses: readonly WhoIsWhoGuess[]; board: readonly WhoIsWhoPokemonCard[]; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; className?: string | undefined }) {
  const ordered = [...guesses].reverse();
  return <Panel title="Intentos" variant="dark" scroll scrollLabel="Intentos de adivinar" {...(className ? { className } : {})} right={<Badge tone="cream">{guesses.length}</Badge>}
    status={ordered.length === 0 ? { kind: 'empty', title: 'Todavía no hay intentos.', text: 'Un intento por equipo y turno: fallar pasa el turno; acertar gana.', live: false } : null}>
    <ul className={s.rows} aria-label="Intentos de la partida">{ordered.map((guess) => {
      const pokemon = board.find((entry) => entry.id === guess.pokemonId);
      const name = members.get(guess.playerId)?.displayName ?? 'Entrenador';
      return <li key={`${guess.playerId}-${guess.attemptedAt}`} data-testid="who-guess">
        <Row name={pokemon?.name ?? guess.pokemonId} color={playerColor(colors.get(guess.playerId) ?? 0)}
          avatar={pokemon ? <img className={s.guessSprite} src={pokemon.sprite} alt="" /> : undefined}
          meta={<span className={s.rowMeta}><span>{name} · {TEAM_NAME[guess.team]} · turno {guess.turnNumber}</span>
            <Chip tone={guess.correct ? 'ok' : 'bad'} icon={<Icon icon={guess.correct ? Check : X} size={18} />}>{guess.correct ? 'Acertó' : 'No era'}</Chip></span>} />
      </li>;
    })}</ul>
  </Panel>;
}

export interface WhoPickDialogProps {
  open: boolean;
  /** `guess`: «Adivinar Pokémon»; `secret`: elegir el secreto del equipo. */
  mode: 'guess' | 'secret';
  cards: readonly WhoIsWhoPokemonCard[];
  discardedIds: readonly string[];
  busy: boolean;
  /** Época del envío (el turno): con ella, tras un rechazo el foco vuelve a «Confirmar» y no cae al `body`. */
  epoch: number;
  onClose(): void;
  onConfirm(pokemonId: string): void;
}

/**
 * Diálogo del catálogo para adivinar o elegir el secreto: un buscador sobre las cartas del tablero (sin buscar, todas;
 * las bajadas lo dicen) y «Confirmar X». Si el servidor rechaza el envío, el diálogo sigue abierto, el aviso global lo
 * dice y el foco vuelve a «Confirmar».
 */
export function WhoPickDialog({ open, mode, cards, discardedIds, busy, epoch, onClose, onConfirm }: WhoPickDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const down = useMemo(() => new Set(discardedIds), [discardedIds]);
  const results = useMemo(() => {
    if (!query.trim()) return cards;
    const ids = new Set(searchPokemonOptions(cards, query, cards.length).map((option) => option.id));
    return cards.filter((pokemon) => ids.has(pokemon.id));
  }, [cards, query]);
  useEffect(() => { if (!open) { setQuery(''); setSelectedId(null); } }, [open]);
  useRefocusAfterReject(epoch, busy, open, confirmRef);
  const selected = cards.find(({ id }) => id === selectedId);
  const guessing = mode === 'guess';
  const title = guessing ? 'Adivinar Pokémon' : 'Elige vuestro Pokémon secreto';
  return <Dialog open={open} title={title} onClose={onClose} width={760} actions={[{ label: 'Cancelar', variant: 'blue', onClick: () => undefined }]}>
    <div className={s.pick}>
      <p className={s.pickHelp}>{guessing ? 'Un intento por turno: si aciertas el secreto rival, ganáis; si fallas, pasa el turno.' : 'Solo tu equipo lo verá. El otro equipo intentará descubrirlo.'}</p>
      <Field label="Buscar en el tablero" icon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre del Pokémon…" autoComplete="off" data-autofocus="" />
      <div className={s.pickGrid} role="group" aria-label="Pokémon del tablero">
        {results.length === 0
          ? <StateBox kind="empty" title="Ningún Pokémon del tablero coincide." text="Prueba con otra parte del nombre." onCream live={false} />
          : results.map((pokemon) => <Card key={pokemon.id} size="sm" sprite={pokemon.sprite} name={pokemon.name} decorativeSprite state={selectedId === pokemon.id ? 'selected' : 'idle'}
            attrs={{ 'data-candidate': pokemon.id, 'aria-label': `${pokemon.name}${down.has(pokemon.id) ? ' (bajada)' : ''}` }} onSelect={() => setSelectedId(pokemon.id)}>
            {down.has(pokemon.id) && <span className={s.pickDown}><Icon icon={EyeOff} size={18} />Bajada</span>}
          </Card>)}
      </div>
      <Pill ref={confirmRef} variant="yellow" block icon={guessing ? Target : LockKeyhole} disabled={!selected} loading={busy} onClick={() => selected && onConfirm(selected.id)} data-testid="who-confirm">
        {selected ? `Confirmar ${selected.name}` : guessing ? 'Elige un candidato' : 'Elige un Pokémon'}
      </Pill>
    </div>
  </Dialog>;
}
