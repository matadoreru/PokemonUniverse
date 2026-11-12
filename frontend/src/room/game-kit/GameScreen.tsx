import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ServerTimer } from '../../components/ServerTimer';
import { Badge, cx, Panel, ScreenSplit } from '../../ui';
import { GameSkipSlot } from './GameSkipSlot';
import { TurnCutin, turnBumpClass } from './useTurnCue';
import s from './GameScreen.module.css';

/** Clase para un panel de la columna lateral que, aunque sea el último, no debe llenar el alto sobrante (vacío). */
export const GAME_SIDE_FIT: string = s.sideFit ?? '';

/** Plazo de la cabecera: el de la ronda («Tiempo») o el de la siguiente fase («Siguiente ronda», «Clasificación»). */
export interface GameTimer {
  deadline: number | null;
  serverOffset: number;
  label: string;
  /** Duración total del plazo (p. ej. `roundSeconds · 1000`): así la barra no se rehace al volver a montar. */
  totalMs?: number | undefined;
}

export interface GameScreenProps {
  /** Nombre del juego (kicker de la cabecera). */
  gameName: string;
  roundNumber: number;
  totalRounds: number;
  /**
   * Fase de la ronda (`game.phase`). Con la ronda, es la clave de la entrada suave de la pista: al cambiar cualquiera de
   * las dos, la pista entra de nuevo sin volver a montarse (ni ella ni la placa de abajo, que conserva el foco y el texto).
   */
  phase?: string | undefined;
  /** Título (`h1`): la pregunta en la ronda («¿Quién es ese Pokémon?») o «¡Era X!» en la revelación. */
  heading: string;
  /** Entradilla corta dentro del título, antes del texto y en pequeño (p. ej. «Se compara» · «Ataque», «Objetivo» · «#025»). */
  headingLead?: string | undefined;
  /** Marca decorativa antes del título (oculta a los lectores; p. ej. la muestra del color del jugador del turno). */
  headingMark?: ReactNode;
  /** Franja al pie de la placa de la ronda, a todo su ancho (p. ej. el rol compacto de Impostor en el móvil). */
  hudFoot?: ReactNode;
  /** Chips extra de la cabecera, junto a la ronda (p. ej. «Referencia Gen 4», «Zoom ×4»). */
  meta?: ReactNode;
  /** Texto de la insignia de la ronda en lugar de «Ronda N de M» (p. ej. «Turno 3 de 6 · Vuelta 1 de 2»). */
  roundLabel?: ReactNode;
  /** Fases de la ronda (`PhaseRail` del kit social), entre la placa de la ronda y la pista; `null` si no hay. */
  phases?: ReactNode;
  timer: GameTimer;
  /**
   * Texto de la única región viva de la pantalla (siempre montada, solo para lectores): ver `guessAnnouncement`.
   * Ningún otro elemento de la pantalla lleva `role="status"` ni `aria-live`.
   */
  announcement: string;
  /** Zona de la pista (`GamePanel` con la silueta, el recorte, la paleta…) o, en la revelación, `GuessRoundReveal`. */
  clue: ReactNode;
  /** Pistas adicionales (`GuessHints`), bajo la pista; `null` si no hay. */
  hints?: ReactNode;
  /** Columna lateral: `GuessPlayersPanel` + `GuessAttemptsFeed` o, en la revelación, `GuessRevealBoard`. */
  side: ReactNode;
  /** Pantalla inferior: `GuessPanel`. */
  bottom: ReactNode;
  className?: string | undefined;
  /** `data-testid` de la pantalla (p. ej. `social-screen`, para contar su región viva en las E2E). */
  testId?: string;
  /** Lo que devuelve `useTurnCue`: mientras no es `null`, «¡Te toca!» y el rebote de la placa de abajo. */
  turnCue?: string | null | undefined;
  /** Otro momento de la pantalla (un `MomentCutin`), fuera de la rejilla. */
  moment?: ReactNode;
}

/**
 * Cuántas veces ha cambiado `key` desde el montaje (0 al montar). No vuelve a montar nada: sirve para alternar dos
 * clases de animación iguales, que el navegador reinicia al cambiar de nombre.
 */
export function useStepCount(key: string): number {
  const [step, setStep] = useState({ key, n: 0 });
  if (step.key !== key) {
    const next = { key, n: step.n + 1 };
    setStep(next);
    return next.n;
  }
  return step.n;
}

/** Clase de entrada de la pista: ninguna al montar (ya entra la pantalla entera) y, en cada cambio, una de las dos. */
export function clueEntryClass(step: number): string | undefined {
  if (step === 0) return undefined;
  return step % 2 === 1 ? s.enterOdd : s.enterEven;
}

/**
 * Marco de las pantallas de juego (spec §2 y §6 «Juegos»), el de los kits de adivinar, social y de subasta:
 * `ScreenSplit fill` con, arriba, la placa de la ronda (ronda N de M, nombre del juego, título, plazo y «Saltar
 * minijuego»), la pista y las pistas adicionales; abajo, la placa de la acción; al lado, el marcador y los intentos (o
 * los puntos de la ronda).
 *
 * En escritorio llena el alto del `main` sin scroll de página y la pista crece con el sitio que quede; en el móvil la
 * pista va arriba con el plazo y la placa de la acción pegada al fondo. El mismo marco sirve a la ronda y a la
 * revelación: así la región viva no se vuelve a montar al cambiar de fase.
 */
export function GameScreen({ gameName, roundNumber, totalRounds, phase, heading, headingLead, headingMark, hudFoot, meta, roundLabel, phases, timer, announcement, clue, hints, side, bottom, className, testId, turnCue = null, moment }: GameScreenProps) {
  const clueStep = useStepCount(`${roundNumber}|${phase ?? ''}`);
  // Ronda o fase nueva: el `main` vuelve arriba. En el móvil, quien bajó a votar o a mirar el marcador vería la placa de la
  // ronda (y lo que cuelga de ella, como el rol de Impostor) fuera de la vista. Al montar no toca nada.
  const screenRef = useRef<HTMLDivElement>(null);
  const shownStep = useRef(clueStep);
  useEffect(() => {
    if (shownStep.current === clueStep) return;
    shownStep.current = clueStep;
    const main = screenRef.current?.closest('main');
    if (main && main.scrollTop > 0) main.scrollTo({ top: 0 });
  }, [clueStep]);
  const top = <div className={s.top}>
    <GameHud gameName={gameName} roundLabel={roundLabel ?? <>Ronda {roundNumber} de {totalRounds}</>} meta={meta} heading={heading} headingLead={headingLead} headingMark={headingMark}
      timer={timer} skip={<GameSkipSlot className={s.skip} />} foot={hudFoot} />
    {phases}
    <div className={cx(s.clue, clueEntryClass(clueStep))}>{clue}</div>
    {hints}
  </div>;
  return <div ref={screenRef} className={cx('content-row', s.screen, className)} {...(testId ? { 'data-testid': testId } : {})}>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <ScreenSplit fill top={top} side={<div className={s.side}>{side}</div>} bottom={bottom} bottomClassName={turnBumpClass(turnCue)} />
    <TurnCutin cue={turnCue} />
    {moment}
  </div>;
}

/** Clase del hueco de los controles de sala de `GameHud` (la de `GameSkipSlot` en `GameScreen`; la galería la usa igual). */
export const GAME_HUD_SKIP: string = s.skip ?? '';

/**
 * Placa de la ronda de `GameScreen`: la insignia de la ronda, el nombre del juego y los chips; el título (con su entradilla
 * y su marca, si las hay); a la derecha, los controles de sala (`skip`, con la clase `GAME_HUD_SKIP`) y el plazo; y, si
 * hay, una franja al pie. Aparte del marco solo para la galería: las pantallas usan `GameScreen`.
 */
export function GameHud({ gameName, roundLabel, meta, heading, headingLead, headingMark, timer, skip, foot }: {
  gameName: string;
  roundLabel: ReactNode;
  meta?: ReactNode;
  heading: string;
  headingLead?: string | undefined;
  headingMark?: ReactNode;
  timer: GameTimer;
  skip?: ReactNode;
  foot?: ReactNode;
}) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>{roundLabel}</Badge>
        <span className={s.gameName}>{gameName}</span>
        {meta}
      </div>
      <h1 className={cx(s.heading, 'ol')} title={headingLead ? `${headingLead}: ${heading}` : heading}>
        {headingMark && <span className={s.headingMark} aria-hidden="true">{headingMark}</span>}
        {headingLead && <span className={s.headingLead}>{headingLead} </span>}
        {heading}
      </h1>
    </div>
    <div className={s.hudSide}>
      {skip}
      {timer.deadline !== null && <div className={s.timer}><ServerTimer deadline={timer.deadline} serverOffset={timer.serverOffset} label={timer.label} {...(timer.totalMs ? { totalMs: timer.totalMs } : {})} /></div>}
    </div>
    {foot && <div className={s.hudFoot}>{foot}</div>}
  </Panel>;
}

/**
 * Zona de la pista: un `Panel` crema que llena el alto libre de la pantalla superior (en el móvil, una franja con tope
 * de alto) y centra su contenido. El cuerpo es un contenedor de tamaño (`container-type: size`): la pista escala con
 * `cqw`/`cqh` (p. ej. `width: min(92cqw, 92cqh)`), así a 1920 crece y a 390 cabe sin desplazar.
 */
export function GamePanel({ title, right, label, variant = 'cream', className, bodyClassName, children }: { title?: ReactNode; right?: ReactNode; /** Nombre accesible de la zona (si no hay `title`). */ label?: string; variant?: 'cream' | 'dark' | 'blue'; className?: string | undefined; /** Clase del cuerpo (el contenedor de tamaño), para un reparto propio de sus hijos. */ bodyClassName?: string | undefined; children: ReactNode }) {
  return <Panel variant={variant} as="section" {...(title ? { title } : {})} {...(right ? { right } : {})} {...(label ? { 'aria-label': label } : {})} className={cx(s.cluePanel, className)} bodyClassName={cx(s.clueBody, bodyClassName)}>
    {children}
  </Panel>;
}
