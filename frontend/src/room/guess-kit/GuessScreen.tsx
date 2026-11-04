import type { ReactNode } from 'react';
import { ServerTimer } from '../../components/ServerTimer';
import { Badge, cx, Panel, ScreenSplit } from '../../ui';
import { GameSkipSlot } from '../GameSkipSlot';
import s from './GuessScreen.module.css';

/** Plazo de la cabecera: el de la ronda («Tiempo») o el de la siguiente fase («Siguiente ronda», «Clasificación»). */
export interface GuessTimer {
  deadline: number | null;
  serverOffset: number;
  label: string;
  /** Duración total del plazo (p. ej. `roundSeconds · 1000`): así la barra no se rehace al volver a montar. */
  totalMs?: number | undefined;
}

export interface GuessScreenProps {
  /** Nombre del juego (kicker de la cabecera). */
  gameName: string;
  roundNumber: number;
  totalRounds: number;
  /** Título (`h1`): la pregunta en la ronda («¿Quién es ese Pokémon?») o «¡Era X!» en la revelación. */
  heading: string;
  /** Chips extra de la cabecera, junto a la ronda (p. ej. «Referencia Gen 4», «Zoom ×4»). */
  meta?: ReactNode;
  timer: GuessTimer;
  /**
   * Texto de la única región viva de la pantalla (siempre montada, solo para lectores): ver `guessAnnouncement`.
   * Ningún otro elemento de la pantalla lleva `role="status"` ni `aria-live`.
   */
  announcement: string;
  /** Zona de la pista (`GuessClue` con la silueta, el recorte, la paleta…) o, en la revelación, `GuessRoundReveal`. */
  clue: ReactNode;
  /** Pistas adicionales (`GuessHints`), bajo la pista; `null` si no hay. */
  hints?: ReactNode;
  /** Columna lateral: `GuessPlayersPanel` + `GuessAttemptsFeed` o, en la revelación, `GuessRevealBoard`. */
  side: ReactNode;
  /** Pantalla inferior: `GuessPanel`. */
  bottom: ReactNode;
  className?: string | undefined;
}

/**
 * Marco de los juegos de adivinar (spec §2 y §6 «Juegos»): `ScreenSplit fill` con, arriba, la placa de la ronda (ronda
 * N de M, nombre del juego, título, plazo y «Saltar minijuego»), la pista y las pistas adicionales; abajo, la placa
 * de la acción; al lado, el marcador y los intentos (o los puntos de la ronda).
 *
 * En escritorio llena el alto del `main` sin scroll de página y la pista crece con el sitio que quede; en el móvil la
 * pista va arriba con el plazo y la placa de la acción pegada al fondo. El mismo marco sirve a la ronda y a la
 * revelación: así la región viva no se vuelve a montar al cambiar de fase.
 */
export function GuessScreen({ gameName, roundNumber, totalRounds, heading, meta, timer, announcement, clue, hints, side, bottom, className }: GuessScreenProps) {
  const top = <div className={s.top}>
    <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
      <div className={s.hudMain}>
        <div className={s.hudMeta}>
          <Badge>Ronda {roundNumber} de {totalRounds}</Badge>
          <span className={s.gameName}>{gameName}</span>
          {meta}
        </div>
        <h1 className={cx(s.heading, 'ol')} title={heading}>{heading}</h1>
      </div>
      <div className={s.hudSide}>
        <GameSkipSlot className={s.skip} />
        {timer.deadline !== null && <div className={s.timer}><ServerTimer deadline={timer.deadline} serverOffset={timer.serverOffset} label={timer.label} {...(timer.totalMs ? { totalMs: timer.totalMs } : {})} /></div>}
      </div>
    </Panel>
    <div className={s.clue}>{clue}</div>
    {hints}
  </div>;
  return <div className={cx('content-row', s.screen, className)}>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <ScreenSplit fill top={top} side={<div className={s.side}>{side}</div>} bottom={bottom} />
  </div>;
}

/**
 * Zona de la pista: un `Panel` crema que llena el alto libre de la pantalla superior (en el móvil, una franja con tope
 * de alto) y centra su contenido. El cuerpo es un contenedor de tamaño (`container-type: size`): la pista escala con
 * `cqw`/`cqh` (p. ej. `width: min(92cqw, 92cqh)`), así a 1920 crece y a 390 cabe sin desplazar.
 */
export function GuessClue({ title, right, label, variant = 'cream', className, children }: { title?: ReactNode; right?: ReactNode; /** Nombre accesible de la zona (si no hay `title`). */ label?: string; variant?: 'cream' | 'dark' | 'blue'; className?: string | undefined; children: ReactNode }) {
  return <Panel variant={variant} as="section" {...(title ? { title } : {})} {...(right ? { right } : {})} {...(label ? { 'aria-label': label } : {})} className={cx(s.cluePanel, className)} bodyClassName={cx(s.clueBody)}>
    {children}
  </Panel>;
}
