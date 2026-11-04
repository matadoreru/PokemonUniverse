import type { ReactNode } from 'react';
import { cx, Panel } from '../../ui';
import s from './SocialPrompt.module.css';

export interface SocialPromptProps {
  /** Línea pequeña encima («La pregunta del grupo», «Red Flag de esta ronda»). */
  kicker: string;
  /** La pregunta o la consigna: se parte en varias líneas y su tamaño crece con el sitio (nunca se corta). */
  text: ReactNode;
  /** Ayuda bajo la pregunta (p. ej. «Elige con sinceridad»). */
  help?: ReactNode;
  /** Imagen a la izquierda (p. ej. la `Card` del Pokémon de la ronda en Red Flag); en el móvil, encima y más pequeña. */
  media?: ReactNode;
  /** Id del texto (para `aria-describedby` de la papeleta o del campo). */
  id?: string;
  className?: string | undefined;
}

/**
 * La pregunta de la ronda en un `Panel` crema (pantalla de arriba): kicker, el texto grande y una ayuda opcional. En
 * escritorio llena el alto libre y centra el texto, que escala con el ancho de su panel (`cqi`); en el móvil mide lo que
 * necesita. Es la escena de todas las fases salvo la revelación.
 */
export function SocialPrompt({ kicker, text, help, media, id, className }: SocialPromptProps) {
  return <Panel variant="cream" as="section" aria-label={kicker} className={cx(s.panel, className)} bodyClassName={cx(s.body, media != null && s.withMedia)}>
    {media != null && <div className={s.media}>{media}</div>}
    <div className={s.copy}>
      <span className={s.kicker}>{kicker}</span>
      <p className={s.text} {...(id ? { id } : {})} data-testid="social-prompt">{text}</p>
      {help && <p className={s.help}>{help}</p>}
    </div>
  </Panel>;
}
