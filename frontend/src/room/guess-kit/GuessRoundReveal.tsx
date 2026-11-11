import type { ReactNode } from 'react';
import { Card, cx, Panel } from '../../ui';
import { guessSprite } from './presentation';
import s from './GuessRoundReveal.module.css';

/** Una respuesta de la ronda (Guess from Stats puede tener varias; Zoomed no manda sprite: va su imagen en `clue`). */
export interface GuessAnswer {
  /** Clave estable de la respuesta (dos formas pueden compartir nombre); si falta, el nombre. */
  id?: string | undefined;
  name: string;
  sprite?: string | undefined;
  number?: number | undefined;
  /** Datos de esta respuesta bajo su carta (p. ej. Guess from Stats: sus tipos y sus estadísticas). */
  detail?: ReactNode;
}

/**
 * Revelación (pantalla superior, en el sitio de la pista): la `Card` de la respuesta (gira al aparecer, marcada
 * correcta y con el sprite cargado con prioridad), su nombre y sus datos y, al lado, la pista ya desvelada (`clue`: la
 * silueta junto al sprite, el recorte inicial, la paleta, el grito para volver a escucharlo…). «¡Era X!» va en el
 * título de la cabecera (`GameScreen heading`); aquí el nombre se repite en grande salvo en el móvil.
 *
 * Solo se monta en `ROUND_RESULTS`, con lo que el servidor manda en `lastRound`.
 */
export function GuessRoundReveal({ answers, kicker = 'Resultado de la ronda', details, clue, clueTitle, className }: { answers: readonly GuessAnswer[]; kicker?: string; /** Datos de la respuesta («Generación 4»). */ details?: ReactNode; /** La pista desvelada. */ clue?: ReactNode; /** Título de la pista desvelada («Así era la silueta»). */ clueTitle?: string; className?: string | undefined }) {
  const several = answers.length > 1;
  const title = several ? `${answers.length} respuestas válidas` : answers[0]?.name ?? '';
  return <Panel variant="cream" as="section" aria-labelledby="guess-reveal-title" className={cx(s.panel, className)} bodyClassName={cx(s.reveal, clue != null && s.withClue)}>
    <ul className={cx(s.cards, several && s.several)} aria-label={several ? 'Respuestas válidas' : 'Respuesta'}>
      {answers.map((answer) => <li key={answer.id ?? answer.name} className={cx(s.card, answer.detail != null && s.withDetail)}>
        <Card name={answer.name} {...(answer.sprite ? { sprite: guessSprite(answer.sprite) } : {})} {...(answer.number != null ? { number: answer.number } : {})} state="correct" flip eager attrs={{ 'data-answer-card': 'true' }} />
        {answer.detail != null && <div className={s.answerDetail}>{answer.detail}</div>}
      </li>)}
    </ul>
    <div className={s.text}>
      <span className={s.kicker}>{kicker}</span>
      <h2 id="guess-reveal-title" className={s.title} title={title}>{title}</h2>
      {details && <div className={s.details}>{details}</div>}
    </div>
    {clue != null && <figure className={s.clue}>
      {clue}
      {clueTitle && <figcaption className={s.kicker}>{clueTitle}</figcaption>}
    </figure>}
  </Panel>;
}
