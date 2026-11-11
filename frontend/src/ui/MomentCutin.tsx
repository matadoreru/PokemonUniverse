import { useEffect, useState } from 'react';
import { audio, type SoundId } from '../audio';
import { useReducedMotion } from '../lib/motion';
import { Confetti } from './Confetti';
import { Cutin, type CutinProps } from './Cutin';

export interface MomentCutinProps extends Omit<CutinProps, 'live' | 'onSkip'> {
  /** Lluvia de confeti a la vez (nunca con reducción de movimiento). */
  confetti?: boolean | undefined;
  /** Semilla del confeti (la misma da la misma ráfaga). */
  confettiSeed?: number | undefined;
  /** Efecto extra al aparecer (además del `game.cutin` del propio cut-in), una vez por anuncio. */
  cue?: SoundId | null | undefined;
  /** Se puede saltar con un clic o con Espacio (por defecto, sí). */
  skippable?: boolean | undefined;
}

/** ¿Se ve el momento? Mientras no se haya saltado el anuncio actual (`tone|title`). */
export function momentVisible(skippedKey: string | null, armKey: string): boolean {
  return skippedKey !== armKey;
}

/**
 * Cut-in para los momentos de una partida (un hito, «¡BINGO!», una eliminación, el siguiente minijuego): un `Cutin`
 * sin región viva propia (`live={false}`: lo dice la única región viva de la pantalla), que se puede saltar con un
 * clic o con Espacio, con confeti y un efecto opcionales. Como `Cutin`, un `title` o `tone` nuevos lo vuelven a
 * mostrar, también tras saltarlo; para repetir el mismo, móntalo con `key`.
 */
export function MomentCutin({ confetti = false, confettiSeed = 1, cue = null, skippable = true, onDone, reducedMotion, ...cutin }: MomentCutinProps) {
  const prefersReduced = useReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const armKey = `${cutin.tone}|${cutin.title}`;
  const [skipped, setSkipped] = useState<string | null>(null);
  useEffect(() => { if (cue) audio.play(cue); }, [armKey, cue]);
  const visible = momentVisible(skipped, armKey);
  const skip = () => { setSkipped(armKey); onDone?.(); };
  return <>
    {visible && <Cutin {...cutin} live={false} reducedMotion={reduced} {...(skippable ? { onSkip: skip } : {})} {...(onDone ? { onDone } : {})} />}
    {confetti && !reduced && <Confetti key={armKey} seed={confettiSeed} />}
  </>;
}
