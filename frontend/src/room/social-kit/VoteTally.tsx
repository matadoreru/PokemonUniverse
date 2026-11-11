import type { AvatarRef } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Crown, Dices, Equal, Scale, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Badge, Bar, Chip, cx, Icon, Panel, Row } from '../../ui';
import { runoffCounts, runoffLeaders, runoffTotal, tallyOutcome, tallySummary, votesText, type RunoffRoundLike } from './presentation';
import { joinNames } from '../../lib/format';
import s from './VoteTally.module.css';

/** Insignia propia del juego en la franja (p. ej. «Fake» en One of Us Is Fake): va con la del ganador, no en texto. */
export interface TallyTag {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Tono de la `Badge` (por defecto `red`: lo que el juego destapa). */
  tone?: 'red' | 'navy' | 'cream';
}

/** Una opción del recuento (la misma que se votó): un Pokémon con su autor, una respuesta escrita o un jugador. */
export interface TallyOption {
  /** Id del candidato en el motor (jugador o respuesta). */
  id: string;
  /** Nombre de la franja (el Pokémon, el autor, el jugador); una línea. */
  name: string;
  /** Imagen de la franja: sprite (`alt=""`) o avatar. */
  media?: ReactNode;
  /** Pokémon que eligió el jugador de la franja (One of Us): sprite pequeño junto al nombre, con su nombre en texto. */
  pick?: { name: string; sprite: string };
  /** Insignias propias del juego (después de la del ganador). */
  tags?: readonly TallyTag[];
  /** Línea bajo el nombre (p. ej. «Respuesta de Ana»). */
  detail?: ReactNode;
  /** Texto largo de la respuesta (Red Flag): se parte en líneas, nunca se recorta. */
  text?: ReactNode;
  /** Color del jugador (`playerColor`) para la banda de la franja. */
  color?: string;
  /** Es la propia: chip «Tuya» (`selfLabel`). El fondo amarillo de «propia» no se usa aquí: la que destaca es la ganadora. */
  self?: boolean;
}

export interface VoteTallyProps {
  /** Opciones que se votaron (todas las respuestas). Sin ninguna: el vacío con `emptyText`. */
  options: readonly TallyOption[];
  /** Vueltas del motor (`lastRound.voteRounds`, en orden): la última decide. Vacío: no hubo votación. */
  rounds: readonly RunoffRoundLike[];
  /**
   * Ganadores del motor, en ids de OPCIÓN (los mismos que `options[].id` y que las `rounds`). Ojo en Red Flag: su
   * `lastRound.winnerIds` son autores; pasa los ids de las respuestas ganadoras (`answers.filter(won).map(id)`).
   */
  winnerIds: readonly string[];
  /** Nombre de quien votó (los votos solo se ven aquí, en la revelación). */
  voterName(playerId: string): string;
  /** Avatar de quien votó, para su ficha (sin él, la ficha lleva la inicial). */
  voterAvatar?: (playerId: string) => AvatarRef | undefined;
  /** Nombre de cada opción en el resumen (por defecto `name`; p. ej. «Psyduck de Ana»). */
  summaryName?: (id: string) => string;
  /** Encima del recuento: la pregunta de la ronda. */
  intro?: ReactNode;
  title?: string;
  /** Insignia de quien gana (por defecto «Ganadora»; One of Us: «Más votado»). */
  winnerLabel?: string;
  /** Icono de esa insignia (por defecto la corona; `null`, sin icono). */
  winnerIcon?: LucideIcon | null;
  /** Resumen propio en lugar del calculado (`tallySummary`); úsalo también en la región viva. */
  summary?: string;
  /** Verbo del resumen calculado («Gana»; One of Us: «Sale»). */
  verb?: string;
  /** Chip de la opción propia (por defecto «Tuya»; One of Us: «Tú»). */
  selfLabel?: string;
  /** Título de cada vuelta (por defecto «Primera vuelta», «Segunda vuelta»). */
  roundLabels?: readonly string[];
  emptyText?: string;
  /** Prefijo de los ids de los títulos de las vueltas. */
  idBase: string;
  className?: string | undefined;
}

const DEFAULT_LABELS = ['Primera vuelta', 'Segunda vuelta'] as const;

/**
 * Revelación de una votación (pantalla de arriba): el resumen en una frase («Gana Psyduck con 2 votos tras la segunda
 * vuelta.») y una franja por opción con «N votos» en grande, su `Bar` (llena respecto a la más votada de la vuelta), las
 * fichas con el avatar de quien la votó (una por voto; los nombres en `title` y en texto para lectores) y las insignias:
 * la de quien gana y las propias del juego. Los empates se dicen en texto («Empate · pasa a la segunda vuelta»,
 * «Empate»). Con varias vueltas, cada una en su bloque con su título, primero la que decide.
 *
 * Los puntos no van aquí: cada juego los da en su lateral «Puntos de la ronda». No es región viva (la de la pantalla
 * es la de `SocialScreen`).
 *
 * Nunca pone «Ganadora» junto a «0 votos»: si nadie votó, «Empate sin votos»; con una sola respuesta, «Única respuesta».
 * Solo se monta en la revelación: es lo único del kit que pinta votos de otros.
 */
export function VoteTally({ options, rounds, winnerIds, voterName, voterAvatar, summaryName, intro, title = 'Recuento de votos', winnerLabel = 'Ganadora', winnerIcon = Crown, summary: ownSummary, verb = 'Gana', selfLabel = 'Tuya', roundLabels = DEFAULT_LABELS, emptyText = 'Nadie respondió a tiempo.', idBase, className }: VoteTallyProps) {
  const byId = new Map(options.map((option) => [option.id, option]));
  const nameOf = summaryName ?? ((id: string) => byId.get(id)?.name ?? id);
  const summary = ownSummary ?? tallySummary(winnerIds, rounds, nameOf, emptyText, verb);
  const outcome = tallyOutcome(winnerIds, rounds);
  const winners = new Set(winnerIds);
  const labelOf = (round: RunoffRoundLike) => roundLabels[round.number - 1] ?? `Vuelta ${round.number}`;

  const list = (round: RunoffRoundLike | null, final: boolean, labelledBy?: string) => {
    const counts = round ? runoffCounts(round) : options.map((option) => ({ id: option.id, votes: 0, voterIds: [] }));
    const total = runoffTotal(counts);
    const top = Math.max(1, ...counts.map((count) => count.votes));
    // Empatados de la vuelta (también en la final: un empate decidido por sorteo o sin ganador se dice en texto).
    const leaders = round && total > 0 ? new Set(runoffLeaders(counts)) : new Set<string>();
    const ordered = counts.map((count, index) => ({ count, index })).sort((a, b) => b.count.votes - a.count.votes || a.index - b.index).map(({ count }) => count);
    return <ol className={s.rows} {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': round ? `Votos de la ${labelOf(round).toLowerCase()}` : 'Respuestas' })}>{ordered.map((count) => {
      const option = byId.get(count.id);
      const name = option?.name ?? count.id;
      const won = final && winners.has(count.id);
      const tied = leaders.has(count.id) && leaders.size > 1;
      const badgeIcon = winnerIcon ? <Icon icon={winnerIcon} size={18} /> : null;
      const chips: ReactNode[] = [];
      if (won && outcome === 'noVotes') chips.push(<Chip key="novotes" tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate sin votos</Chip>);
      else if (won && outcome === 'unopposed') chips.push(<Badge key="win">{badgeIcon}Única respuesta</Badge>);
      else if (won) chips.push(<Badge key="win">{badgeIcon}{winnerLabel}</Badge>);
      for (const tag of option?.tags ?? []) chips.push(<Badge key={`tag-${tag.key}`} tone={tag.tone ?? 'red'}>{tag.icon && <Icon icon={tag.icon} size={18} />}{tag.label}</Badge>);
      if (tied && outcome !== 'noVotes') {
        const text = !final ? 'Empate · pasa a la segunda vuelta' : outcome === 'lot' ? 'Empate · sorteo' : 'Empate';
        chips.push(<Chip key="tie" tone="warn" icon={<Icon icon={!final ? Scale : outcome === 'lot' ? Dices : Equal} size={18} />}>{text}</Chip>);
      }
      if (option?.self) chips.push(<Chip key="self" tone="neutral" icon={<Icon icon={UserRound} size={18} />}>{selfLabel}</Chip>);
      const voters = round ? count.voterIds : [];
      return <li key={count.id} data-testid="tally-row" data-tally-winner={won || undefined}>
        <Row inline name={name} {...(option?.color ? { color: option.color } : {})} highlight={won} {...(option?.media ? { avatar: option.media } : {})}
          meta={<span className={s.meta}>
            {(option?.pick || option?.detail || chips.length > 0) && <span className={s.tags}>
              {option?.pick && <span className={s.pick} data-testid="tally-pick" title={`Eligió ${option.pick.name}`}>
                <img className={s.pickSprite} src={option.pick.sprite} alt="" loading="lazy" decoding="async" /><span className="sr-only">eligió </span>{option.pick.name}
              </span>}
              {option?.detail && <span className={s.detail}>{option.detail}</span>}
              {chips}
            </span>}
            {option?.text && <span className={s.text}>{option.text}</span>}
            {round
              ? <span className={s.count}>
                <span className={s.bar}><Bar value={count.votes} max={top} tone={won ? 'yellow' : 'info'} label={`${name}: ${votesText(count.votes)}`} decorative grow size="lg" /></span>
                {voters.length > 0 && <span className={s.voters} data-testid="tally-voters">
                  <span className={s.voterChips} aria-hidden="true">{voters.map((id) => <span key={id} className={s.voter} title={voterName(id)} data-testid="tally-voter">
                    <Avatar name={voterName(id)} avatar={voterAvatar?.(id)} size="xs" />
                  </span>)}</span>
                  <span className="sr-only">{`Votos de ${joinNames(voters.map(voterName))}`}</span>
                </span>}
              </span>
              : <span className={s.detail}>Sin votación</span>}
          </span>}
          {...(round ? { value: <span className={s.votes} data-testid="tally-votes"><span className={s.votesNumber}>{count.votes}</span> <span className={s.votesWord}>{count.votes === 1 ? 'voto' : 'votos'}</span></span> } : {})} />
      </li>;
    })}</ol>;
  };

  // La vuelta que decide, arriba (y con su título si hubo más); las anteriores debajo, en orden inverso.
  const shown = rounds.map((round, index) => ({ round, final: index === rounds.length - 1 })).reverse();
  return <Panel title={title} variant="dark" scroll scrollLabel={title} className={cx(s.tally, className)} status={options.length === 0 ? { kind: 'empty', title: emptyText, text: 'La ronda termina sin puntos.', live: false } : null}>
    {intro && <p className={s.intro}>{intro}</p>}
    <p className={s.summary} data-testid="tally-summary">{summary}</p>
    {rounds.length > 1
      ? <div className={s.rounds}>{shown.map(({ round, final }) => {
        const headingId = `${idBase}-round-${round.number}`;
        return <section key={round.number} className={cx(s.round, !final && s.earlier)} data-tally-round={round.number} aria-labelledby={headingId}>
          <h3 id={headingId} className={s.roundTitle}>{labelOf(round)}{final && <span className={s.roundNote}> · decide</span>}</h3>
          {list(round, final, headingId)}
        </section>;
      })}</div>
      : list(rounds[0] ?? null, true)}
  </Panel>;
}
