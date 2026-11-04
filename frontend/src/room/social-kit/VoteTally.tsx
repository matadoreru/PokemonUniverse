import { Crown, Equal, Scale } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, Bar, Chip, cx, Icon, Panel, Row, TabPanel, Tabs } from '../../ui';
import { namesList, runoffCounts, runoffLeaders, runoffTotal, tallyOutcome, tallySummary, votesText, type RunoffRoundLike } from './presentation';
import s from './VoteTally.module.css';

/** Una opción del recuento (la misma que se votó): un Pokémon con su autor, una respuesta escrita o un jugador. */
export interface TallyOption {
  /** Id del candidato en el motor (jugador o respuesta). */
  id: string;
  /** Nombre de la franja (el Pokémon, el autor, el jugador); una línea. */
  name: string;
  /** Imagen de la franja: sprite (`alt=""`) o avatar. */
  media?: ReactNode;
  /** Línea bajo el nombre (p. ej. «Respuesta de Ana»). */
  detail?: ReactNode;
  /** Texto largo de la respuesta (Red Flag): se parte en líneas, nunca se recorta. */
  text?: ReactNode;
  /** Color del jugador (`playerColor`) para la banda de la franja. */
  color?: string;
  /** Es la propia (franja amarilla). */
  self?: boolean;
}

export interface VoteTallyProps {
  /** Opciones que se votaron (todas las respuestas). Sin ninguna: el vacío con `emptyText`. */
  options: readonly TallyOption[];
  /** Vueltas del motor (`lastRound.voteRounds`, en orden): la última decide. Vacío: no hubo votación. */
  rounds: readonly RunoffRoundLike[];
  /** Ganadores del motor (`lastRound.winnerIds`; la mayoría votada o el fake expulsado). */
  winnerIds: readonly string[];
  /** Nombre de quien votó (los votos solo se ven aquí, en la revelación). */
  voterName(playerId: string): string;
  /** Puntos de cada opción en la ronda (`+3`), a la derecha de la franja de la vuelta final; `null`: nada. */
  points?: (id: string) => number | null;
  /** Nombre de cada opción en el resumen (por defecto `name`; p. ej. «Psyduck de Ana»). */
  summaryName?: (id: string) => string;
  /** Encima del recuento: la pregunta de la ronda. */
  intro?: ReactNode;
  title?: string;
  /** Insignia de quien gana (por defecto «Ganadora»; One of Us: «Más votado»). */
  winnerLabel?: string;
  /** Pestañas de las vueltas (por defecto «Primera vuelta», «Segunda vuelta»). */
  roundLabels?: readonly string[];
  emptyText?: string;
  /** Prefijo de los ids de las pestañas. */
  idBase: string;
  className?: string | undefined;
}

const DEFAULT_LABELS = ['Primera vuelta', 'Segunda vuelta'] as const;

/**
 * Revelación de una votación (pantalla de arriba): el resumen en una frase («Gana Psyduck con 2 votos tras la segunda
 * vuelta.») y una franja por opción con su `Bar` (parte de los votos de la vuelta), el número en texto, quién la votó y
 * la insignia de quien gana. Los empates se dicen en texto («Empate · pasa a la segunda vuelta», «Empate»). Con segunda
 * vuelta, una pestaña por vuelta (abierta la que decide).
 *
 * Nunca pone «Ganadora» junto a «0 votos»: si nadie votó, «Empate sin votos»; con una sola respuesta, «Única respuesta».
 * Solo se monta en la revelación: es lo único del kit que pinta votos de otros.
 */
export function VoteTally({ options, rounds, winnerIds, voterName, points, summaryName, intro, title = 'Recuento de votos', winnerLabel = 'Ganadora', roundLabels = DEFAULT_LABELS, emptyText = 'Nadie respondió a tiempo.', idBase, className }: VoteTallyProps) {
  const [active, setActive] = useState(String(Math.max(0, rounds.length - 1)));
  const byId = new Map(options.map((option) => [option.id, option]));
  const nameOf = summaryName ?? ((id: string) => byId.get(id)?.name ?? id);
  const summary = tallySummary(winnerIds, rounds, nameOf, emptyText);
  const outcome = tallyOutcome(winnerIds, rounds);
  const winners = new Set(winnerIds);

  const list = (round: RunoffRoundLike | null, final: boolean) => {
    const counts = round ? runoffCounts(round) : options.map((option) => ({ id: option.id, votes: 0, voterIds: [] }));
    const total = runoffTotal(counts);
    const leaders = round && !final ? new Set(runoffLeaders(counts)) : new Set<string>();
    const ordered = counts.map((count, index) => ({ count, index })).sort((a, b) => b.count.votes - a.count.votes || a.index - b.index).map(({ count }) => count);
    return <ol className={s.rows} aria-label={round ? `Votos de la ${(roundLabels[round.number - 1] ?? `vuelta ${round.number}`).toLowerCase()}` : 'Respuestas'}>{ordered.map((count) => {
      const option = byId.get(count.id);
      const name = option?.name ?? count.id;
      const won = final && winners.has(count.id);
      const tied = final ? won && winnerIds.length > 1 : leaders.has(count.id) && leaders.size > 1;
      const pts = final ? points?.(count.id) ?? null : null;
      const chips: ReactNode[] = [];
      if (won && outcome === 'noVotes') chips.push(<Chip key="novotes" tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate sin votos</Chip>);
      else if (won && outcome === 'unopposed') chips.push(<Badge key="win"><Icon icon={Crown} size={18} />Única respuesta</Badge>);
      else if (won) chips.push(<Badge key="win"><Icon icon={Crown} size={18} />{winnerLabel}</Badge>);
      if (tied && outcome !== 'noVotes') chips.push(<Chip key="tie" tone="warn" icon={<Icon icon={final ? Equal : Scale} size={18} />}>{final ? 'Empate' : 'Empate · pasa a la segunda vuelta'}</Chip>);
      return <li key={count.id} data-testid="tally-row" data-tally-winner={won || undefined}>
        <Row name={name} {...(option?.color ? { color: option.color } : {})} self={Boolean(option?.self)} {...(option?.media ? { avatar: option.media } : {})}
          meta={<span className={s.meta}>
            {option?.text && <span className={s.text}>{option.text}</span>}
            {round
              ? <span className={s.count}><span className={s.bar}><Bar value={count.votes} max={Math.max(1, total)} tone={won ? 'yellow' : 'info'} label={`${name}: ${votesText(count.votes)}`} decorative grow /></span><strong className={s.votes} data-testid="tally-votes">{votesText(count.votes)}</strong></span>
              : <span className={s.voters}>Sin votación</span>}
            {chips.length > 0 && <span className={s.chips}>{chips}</span>}
            {(option?.detail || (round && count.voterIds.length > 0)) && <span className={s.voters}>
              {option?.detail}{option?.detail && round && count.voterIds.length > 0 && ' · '}{round && count.voterIds.length > 0 && `Votos de ${namesList(count.voterIds.map(voterName))}`}
            </span>}
          </span>}
          {...(pts !== null ? { value: <span className={s.points}>+{pts}</span> } : {})} />
      </li>;
    })}</ol>;
  };

  const several = rounds.length > 1;
  return <Panel title={title} variant="dark" scroll scrollLabel={title} className={cx(s.tally, className)} status={options.length === 0 ? { kind: 'empty', title: emptyText, text: 'La ronda termina sin puntos.', live: false } : null}>
    {intro && <p className={s.intro}>{intro}</p>}
    <p className={s.summary} data-testid="tally-summary">{summary}</p>
    {several
      ? <>
        <Tabs idBase={idBase} label="Vueltas de la votación" active={active} onChange={setActive} items={rounds.map((round, index) => ({ key: String(index), label: roundLabels[index] ?? `Vuelta ${round.number}` }))} className={cx(s.tabs)} />
        {rounds.map((round, index) => String(index) === active && <TabPanel key={round.number} idBase={idBase} tabKey={String(index)} className={cx(s.tabPanel)}>{list(round, index === rounds.length - 1)}</TabPanel>)}
      </>
      : list(rounds[0] ?? null, true)}
  </Panel>;
}
