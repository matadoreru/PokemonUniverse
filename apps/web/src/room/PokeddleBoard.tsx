import type { PokeddleClueKey, PokeddleFeedbackEntry, PokeddlePublicBoard } from '@pokemon-universe/shared';
import { Check, CheckCircle2, Minus } from 'lucide-react';
import { memo, useMemo } from 'react';
import {
  formatPokeddleFeedback,
  getPokeddleColumns,
  isPokeddleGroupStart,
  latestGuessRound,
  pokemonTypeIcons,
  pokemonTypeLabels,
  POKEDDLE_GROUP_LABELS,
  type PokeddleColumn,
} from './pokeddle-presentation';

export interface PokeddleBoardProps {
  board: PokeddlePublicBoard;
  clues: PokeddleClueKey[];
  mode?: 'self' | 'spectator';
  showLegend?: boolean;
}

const legend = [
  { semantic: 'higher', symbol: '↑', label: 'Objetivo mayor', tone: 'text-aqua' },
  { semantic: 'lower', symbol: '↓', label: 'Objetivo menor', tone: 'text-violet-300' },
  { semantic: 'match', symbol: '=', label: 'Coincide', tone: 'text-leaf' },
  { semantic: 'partial', symbol: '~', label: 'Parcial', tone: 'text-electric' },
  { semantic: 'none', symbol: '×', label: 'Ninguno', tone: 'text-berry' },
] as const;

export function PokeddleLegend() {
  return <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-extrabold text-ink/55" aria-label="Leyenda de las pistas">
    {legend.map((item) => <span key={item.semantic} className="inline-flex items-center gap-1.5"><b className={`text-base leading-none ${item.tone}`} aria-hidden="true">{item.symbol}</b>{item.label}</span>)}
  </div>;
}

function TypeBadges({ entry }: { entry: Extract<PokeddleFeedbackEntry, { kind: 'TYPES' }> }) {
  return <span className="flex max-w-44 flex-wrap gap-1">{entry.value.map((type) => <span key={type} className="inline-flex items-center gap-1 rounded-full bg-ink/[0.07] px-2 py-0.5 text-[11px] font-black text-ink/80"><span aria-hidden="true">{pokemonTypeIcons[type] ?? '●'}</span>{pokemonTypeLabels[type] ?? type}</span>)}</span>;
}

function FeedbackValue({ column, entry, mobile = false }: { column: PokeddleColumn; entry: PokeddleFeedbackEntry; mobile?: boolean }) {
  const shown = formatPokeddleFeedback(column.key, entry);
  return <div
    className={`pokeddle-feedback ${shown.tone} ${mobile ? 'min-h-[4.15rem] rounded-xl px-2.5 py-2' : 'min-h-14 px-2.5 py-2'}`}
    data-feedback={shown.semantic}
    aria-label={`${column.fullLabel}: ${shown.value}. ${shown.accessibleResult}.`}
  >
    {entry.kind === 'TYPES' ? <TypeBadges entry={entry} /> : <strong className={`block leading-tight text-ink ${mobile ? 'text-base' : 'text-[15px]'}`}>{shown.value}</strong>}
    <span className="mt-1 flex items-center gap-1 text-[11px] font-black leading-none"><b className="text-base" aria-hidden="true">{shown.symbol}</b><span>{shown.result.slice(2)}</span></span>
  </div>;
}

function EmptyBoard({ columnCount }: { columnCount?: number }) {
  if (columnCount) return <tr><td colSpan={columnCount} className="px-4 py-10 text-center font-bold text-ink/40">Tu historial aparecerá aquí al terminar la ronda.</td></tr>;
  return <div className="rounded-2xl border border-dashed border-ink/15 px-4 py-10 text-center font-bold text-ink/40">Tu historial aparecerá aquí al terminar la ronda.</div>;
}

function NoGuessBand({ round, mobile = false }: { round: number; mobile?: boolean }) {
  const content = <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-berry/85" data-row-status="no-guess"><span className="h-px min-w-4 flex-1 bg-berry/20" /><Minus size={15} aria-hidden="true" /><span>Ronda {round} · Sin respuesta</span><span className="h-px min-w-4 flex-1 bg-berry/20" /></div>;
  return mobile ? <div className="rounded-xl bg-berry/[0.05] px-3 py-2.5">{content}</div> : content;
}

function PokemonAnchor({ row, latest }: { row: PokeddlePublicBoard['rows'][number]; latest: boolean }) {
  return <span className="flex min-w-0 items-center gap-2.5">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink/[0.05]"><img src={row.guessedPokemon?.sprite} alt="" className="h-10 w-10 object-contain [image-rendering:pixelated]" /></span>
    <span className="min-w-0"><strong className="block max-w-28 truncate font-display text-[15px] text-ink">{row.guessedPokemon?.name}</strong><small className="flex items-center gap-1 font-bold text-ink/40">Ronda {row.round}{latest && <span className="rounded-full bg-aqua/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-aqua">Último</span>}</small></span>
    {row.correct && <CheckCircle2 className="shrink-0 text-leaf" size={19} aria-label="Pokémon encontrado" />}
  </span>;
}

function DesktopBoard({ board, columns }: { board: PokeddlePublicBoard; columns: PokeddleColumn[] }) {
  const latestRound = latestGuessRound(board.rows);
  return <div className="hidden max-h-[34rem] max-w-full overflow-auto overscroll-contain lg:block">
    <table className="w-max min-w-full border-separate border-spacing-0 text-sm" aria-label={`Historial Pokédle de ${board.playerId}`}>
      <thead><tr className="text-left text-xs uppercase tracking-wide text-ink/55">
        <th className="sticky left-0 top-0 z-30 min-w-48 border-b border-ink/10 bg-night/95 px-3 py-2.5 font-black backdrop-blur">Pokémon</th>
        {columns.map((column, index) => <th key={column.key} data-clue-key={column.key} title={column.fullLabel} className={`sticky top-0 z-20 border-b border-ink/10 bg-night/95 px-2.5 py-2.5 font-black backdrop-blur ${column.minWidth} ${isPokeddleGroupStart(columns, index) ? 'border-l-2 !border-l-ink/15' : ''}`}>{column.label}</th>)}
      </tr></thead>
      <tbody>{board.rows.length ? board.rows.map((row) => {
        if (row.status === 'NO_GUESS') return <tr key={row.round} className="border-t border-ink/5"><td colSpan={columns.length + 1} className="bg-night/15 px-3 py-2"><NoGuessBand round={row.round} /></td></tr>;
        const latest = row.round === latestRound;
        return <tr key={row.round} data-latest={latest ? 'true' : undefined} data-correct={row.correct ? 'true' : undefined} className={`border-t border-ink/[0.07] transition-opacity ${latest ? 'pokeddle-row-enter bg-aqua/[0.035]' : 'opacity-75 hover:opacity-100'} ${row.correct ? '!bg-leaf/[0.06] !opacity-100' : ''}`}>
          <td className={`sticky left-0 z-10 border-b border-ink/[0.07] px-3 py-2.5 ${latest ? 'border-l-2 border-l-aqua bg-[#151e2f]' : row.correct ? 'border-l-2 border-l-leaf bg-[#172538]' : 'bg-surface'}`}><PokemonAnchor row={row} latest={latest} /></td>
          {columns.map((column, index) => { const feedback = row.feedback?.[column.key]; return <td key={column.key} className={`border-b border-ink/[0.07] p-0 align-top ${isPokeddleGroupStart(columns, index) ? 'border-l-2 !border-l-ink/15' : ''}`}>{feedback ? <FeedbackValue column={column} entry={feedback} /> : <span className="block px-3 py-4 text-ink/20">—</span>}</td>; })}
        </tr>;
      }) : <EmptyBoard columnCount={columns.length + 1} />}</tbody>
    </table>
  </div>;
}

function MobileBoard({ board, columns }: { board: PokeddlePublicBoard; columns: PokeddleColumn[] }) {
  const latestRound = latestGuessRound(board.rows);
  const groups = useMemo(() => [...new Set(columns.map((column) => column.group))], [columns]);
  if (!board.rows.length) return <div className="lg:hidden"><EmptyBoard /></div>;
  return <div className="space-y-2.5 lg:hidden">{board.rows.map((row) => {
    if (row.status === 'NO_GUESS') return <NoGuessBand key={row.round} round={row.round} mobile />;
    const latest = row.round === latestRound;
    return <article key={row.round} data-latest={latest ? 'true' : undefined} data-correct={row.correct ? 'true' : undefined} className={`overflow-hidden rounded-2xl border bg-night/20 ${latest ? 'pokeddle-row-enter border-aqua/35 shadow-[inset_3px_0_0_rgba(82,199,232,.7)]' : 'border-ink/10 opacity-75'} ${row.correct ? '!border-leaf/45 !bg-leaf/[0.06] !opacity-100' : ''}`}>
      <header className="flex items-center justify-between gap-3 border-b border-ink/[0.07] px-3 py-2.5"><PokemonAnchor row={row} latest={latest} />{row.correct && <span className="inline-flex items-center gap-1 rounded-full bg-leaf/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-leaf"><Check size={13} /> Encontrado</span>}</header>
      <div className="space-y-3 p-3">{groups.map((group) => {
        const groupColumns = columns.filter((column) => column.group === group);
        return <section key={group} aria-label={POKEDDLE_GROUP_LABELS[group]}><h3 className="mb-1.5 text-[10px] font-black uppercase tracking-[.14em] text-ink/35">{POKEDDLE_GROUP_LABELS[group]}</h3><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{groupColumns.map((column) => { const feedback = row.feedback?.[column.key]; return <div key={column.key} data-clue-key={column.key}><span className="mb-0.5 block px-1 text-[10px] font-extrabold text-ink/45" title={column.fullLabel}>{column.label}</span>{feedback ? <FeedbackValue column={column} entry={feedback} mobile /> : <span className="block px-2 py-3 text-ink/20">—</span>}</div>; })}</div></section>;
      })}</div>
    </article>;
  })}</div>;
}

export const PokeddleBoard = memo(function PokeddleBoard({ board, clues, mode = 'self', showLegend = mode === 'self' }: PokeddleBoardProps) {
  const columns = useMemo(() => getPokeddleColumns(clues), [clues]);
  return <div className="overflow-hidden rounded-2xl border border-ink/10 bg-surface-raised/45" data-board-mode={mode}>
    {board.revealedPokemon && <div className="flex items-center gap-3 border-b border-leaf/20 bg-leaf/[0.07] px-4 py-3"><img src={board.revealedPokemon.sprite} alt="" className="h-14 w-14 object-contain [image-rendering:pixelated]" /><div><strong className="block font-display text-xl text-leaf">{board.solved ? 'Pokémon encontrado' : 'Objetivo revelado'}</strong><span className="font-extrabold">{board.revealedPokemon.name}</span>{board.solved && <small className="ml-2 font-bold text-ink/45">Ronda {board.solvedRound}</small>}</div></div>}
    <DesktopBoard board={board} columns={columns} />
    <div className="max-h-[58vh] overflow-y-auto overscroll-contain p-2.5 sm:max-h-[32rem] lg:hidden"><MobileBoard board={board} columns={columns} /></div>
    {showLegend && <div className="border-t border-ink/[0.07] px-3 py-2.5"><PokeddleLegend /></div>}
  </div>;
});
