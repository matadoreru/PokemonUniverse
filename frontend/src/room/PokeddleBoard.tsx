import type { PokeddleClueKey, PokeddleFeedbackEntry, PokeddlePublicBoard } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, Check, EqualApproximately, Minus, X } from 'lucide-react';
import { memo, useMemo, type CSSProperties } from 'react';
import { pokemonTypeLabels } from '../components/PokemonTypeBadge';
import { Badge, Chip, cx, Icon, Panel, StateBox, TypeBadge } from '../ui';
import { guessSprite } from './guess-kit';
import { formatPokeddleFeedback, getPokeddleColumns, latestGuessRound, POKEDDLE_LEGEND, pokeddleAttemptsText, type PokeddleColumn, type PokeddleFeedbackSemantic } from './pokeddle-presentation';
import s from '../games/pokeddle-race/PokeddleBoard.module.css';

/** Icono de cada resultado: el color nunca va solo (icono y palabra a la vista, frase para lectores). */
export const POKEDDLE_ICONS: Record<PokeddleFeedbackSemantic, LucideIcon> = { match: Check, partial: EqualApproximately, none: X, higher: ArrowUp, lower: ArrowDown };

export interface PokeddleBoardProps {
  board: PokeddlePublicBoard;
  clues: readonly PokeddleClueKey[];
  /** Encabezado del panel (por defecto «Tu tablero»). */
  title?: string;
  /** Tablero propio o de un rival (en su diálogo: alto fijo y textos en tercera persona). */
  mode?: 'self' | 'rival';
  /** Nombre del dueño (tablero de un rival). */
  owner?: string;
  className?: string | undefined;
}

/**
 * Leyenda de los colores, iconos y palabras del tablero. Grande (fichas) en el vacío; compacta (`compact`: el icono en
 * su color y la palabra, sin ficha) en la franja fija bajo las filas, siempre a la vista.
 */
export function PokeddleLegend({ className, compact = false }: { className?: string | undefined; compact?: boolean }) {
  return <ul className={cx(s.legend, compact && s.legendCompact, className)} aria-label="Cómo leer el tablero">
    {POKEDDLE_LEGEND.map(({ semantic, label }) => <li key={semantic} className={cx(s.legendItem, !compact && s[`tone_${formatTone(semantic)}`])}>
      <span className={cx(s.legendIcon, compact && s[`tone_${formatTone(semantic)}`])}><Icon icon={POKEDDLE_ICONS[semantic]} size={18} /></span>{label}
    </li>)}
  </ul>;
}

const formatTone = (semantic: PokeddleFeedbackSemantic) => (semantic === 'match' ? 'ok' : semantic === 'partial' ? 'warn' : 'bad');

/** Una casilla: el valor del intento, el icono y la palabra del resultado, y la frase completa para lectores. */
function Cell({ column, entry }: { column: PokeddleColumn; entry: PokeddleFeedbackEntry | undefined }) {
  if (!entry) return <li className={s.cell} data-clue-key={column.key}><span className={s.cellLabel} aria-hidden="true">{column.label}</span><span className={s.value} aria-hidden="true">—</span><span className="sr-only">{column.fullLabel}: sin dato.</span></li>;
  const shown = formatPokeddleFeedback(column.key, entry);
  return <li className={cx(s.cell, s[`tone_${shown.tone}`])} data-clue-key={column.key} data-feedback={shown.semantic}>
    <span className={s.cellLabel} aria-hidden="true">{column.label}</span>
    <span className={s.value} aria-hidden="true">
      {entry.kind === 'TYPES'
        ? <span className={s.types}>{entry.value.map((type) => <TypeBadge key={type} type={type} label={pokemonTypeLabels[type] ?? type} size="sm" />)}</span>
        : shown.short}
    </span>
    <span className={s.result} aria-hidden="true"><Icon icon={POKEDDLE_ICONS[shown.semantic]} size={18} /><span className={s.resultWord}>{shown.result}</span></span>
    <span className="sr-only">{column.fullLabel}: {shown.value}. {shown.accessibleResult}.</span>
  </li>;
}

/**
 * Tablero de intentos de Pokédle (spec §2: la lista larga se desplaza dentro de su `Panel`). Una fila por ronda, la
 * última arriba: el Pokémon probado y una casilla por pista con color, icono y palabra (acierto, parcial, fallo, mayor o
 * menor), y la frase completa para lectores. Las rondas sin respuesta son una franja fina.
 *
 * En escritorio las casillas forman columnas bajo una cabecera fija y crecen con el ancho (a 1920 llenan el sitio); si
 * no caben todas, el tablero se desplaza en horizontal dentro del panel. En el móvil cada fila es una tarjeta compacta
 * con la etiqueta en cada casilla.
 */
export const PokeddleBoard = memo(function PokeddleBoard({ board, clues, title = 'Tu tablero', mode = 'self', owner, className }: PokeddleBoardProps) {
  const columns = useMemo(() => getPokeddleColumns(clues), [clues]);
  const template = columns.map((column) => (column.wide ? 'minmax(5.5rem, 1.7fr)' : 'minmax(3rem, 1fr)')).join(' ');
  const latestRound = latestGuessRound(board.rows);
  const rows = [...board.rows].reverse();
  const self = mode === 'self';
  const style = { '--pokeddle-cells': template, '--pokeddle-rows': Math.max(1, rows.length) } as CSSProperties;
  return <Panel variant="cream" as="section" title={title} right={<Badge tone="cream">{pokeddleAttemptsText(board.validGuesses)}</Badge>} flush
    className={cx(s.panel, mode === 'rival' && s.inDialog, className)} bodyClassName={cx(s.body)}>
    <div className={s.scroller} tabIndex={0} role="region" aria-label={self ? 'Tablero de intentos' : `Tablero de intentos de ${owner ?? 'un rival'}`} data-board-mode={mode}>
      {rows.length === 0
        ? <div className={s.empty}>
          {self
            ? <StateBox kind="empty" live={false} onCream title="Tu primer intento aparecerá aquí." text="Elige un Pokémon cada ronda: al cerrarse verás en qué pistas coincide con tu Pokémon secreto." />
            : <StateBox kind="empty" live={false} onCream title="Todavía no hay intentos." text="Sus intentos aparecen aquí al cerrarse cada ronda." />}
          <PokeddleLegend />
        </div>
        : <div className={s.board} style={style}>
          <div className={s.head} aria-hidden="true">
            <span className={s.headAnchor}>Pokémon</span>
            <span className={s.headCells}>{columns.map((column) => <span key={column.key} title={column.fullLabel}>{column.label}</span>)}</span>
          </div>
          <ol className={s.rows} aria-label={self ? 'Tus intentos, el último primero' : `Intentos de ${owner ?? 'un rival'}, el último primero`}>{rows.map((row) => {
            if (row.status === 'NO_GUESS') return <li key={row.round} className={s.missed} data-row-status="no-guess"><Icon icon={Minus} size={18} />Ronda {row.round} · Sin respuesta</li>;
            const latest = row.round === latestRound;
            const name = row.guessedPokemon?.name ?? 'Pokémon';
            return <li key={row.round} className={cx(s.row, latest && s.latest, row.correct && s.correct, latest && 'motion-enter-up')} data-testid="pokeddle-row"
              data-latest={latest ? 'true' : undefined} data-correct={row.correct ? 'true' : undefined}>
              <div className={s.anchor}>
                {row.guessedPokemon && <img className={s.sprite} src={guessSprite(row.guessedPokemon.sprite)} alt="" />}
                <span className={s.anchorText}>
                  <strong className={s.name} title={name}>{name}</strong>
                  <span className={s.anchorMeta}>
                    <span className={s.round}>Ronda {row.round}</span>
                    {row.correct
                      ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Encontrado</Chip>
                      : latest && <Chip tone="info">Último</Chip>}
                  </span>
                </span>
              </div>
              <ul className={s.cells} aria-label={`Pistas de ${name}, ronda ${row.round}`}>{columns.map((column) => <Cell key={column.key} column={column} entry={row.feedback?.[column.key]} />)}</ul>
            </li>;
          })}</ol>
        </div>}
    </div>
    {rows.length > 0 && <PokeddleLegend compact className={s.footLegend} />}
  </Panel>;
});
