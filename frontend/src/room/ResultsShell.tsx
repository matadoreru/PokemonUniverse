import { Trophy } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { audio } from '../audio';

/** Efecto del final: el podio de la sesión da `game.win` al campeón y `game.podium` al resto; los resultados de una partida solo `game.win` al ganador. */
export function resultsCue({ podium, won }: { podium: boolean; won: boolean }): 'game.win' | 'game.podium' | null {
  if (won) return 'game.win';
  return podium ? 'game.podium' : null;
}

export function ResultsShell({ title, subtitle, won = false, podium = false, children }: { title: string; subtitle: string; won?: boolean; podium?: boolean; children: ReactNode }) {
  // Solo al montar: un cambio posterior de `won` no repite el sonido.
  const initial = useRef({ podium, won });
  useEffect(() => {
    const cue = resultsCue(initial.current);
    if (cue) audio.play(cue);
  }, []);
  return <section className="mx-auto max-w-2xl px-3 py-8 sm:px-5"><div className="card"><div className="mb-7 text-center"><Trophy className="mx-auto text-berry" size={48} /><span className="label mt-3">{subtitle}</span><h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1></div>{children}</div></section>;
}
