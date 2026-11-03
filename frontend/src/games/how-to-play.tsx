import { ArrowUpDown, BarChart3, BookOpen, Clock3, Eye, Flame, LockKeyhole, MessageSquareText, Palette, Search, Sparkles, Swords, Target, Timer, Trophy, UserX, Vote, Zap, type LucideIcon } from 'lucide-react';
import type { HowToPlaySlide } from '../components/HowToPlayCarousel';

type Tone = 'aqua' | 'berry' | 'electric' | 'leaf';

/** Clases literales por token (Tailwind solo genera las que aparecen enteras en el código). */
const toneClass: Record<Tone, string> = {
  aqua: 'bg-aqua/15 text-aqua',
  berry: 'bg-berry/15 text-berry',
  electric: 'bg-electric/15 text-electric',
  leaf: 'bg-leaf/15 text-leaf',
};

type Step = readonly [title: string, description: string, icon: LucideIcon, tone: Tone];

function steps(...items: readonly [Step, Step, Step]): readonly [HowToPlaySlide, HowToPlaySlide, HowToPlaySlide] {
  const [first, second, third] = items.map(([title, description, Icon, tone], index): HowToPlaySlide => ({
    eyebrow: `Paso ${index + 1} de 3`,
    title,
    description,
    visual: <span className={`grid h-24 w-24 place-items-center rounded-2xl ${toneClass[tone]}`} aria-hidden="true"><Icon size={56} /></span>,
  })) as [HowToPlaySlide, HowToPlaySlide, HowToPlaySlide];
  return [first, second, third];
}

/**
 * «Cómo se juega» de los 6 minijuegos (MINIJUEGOS_MEJORAS.md §8.1): los títulos son literales del documento
 * y las descripciones se han comprobado contra las reglas de `packages/shared/src/games/<id>/`.
 */
export const gameHowToPlay: Readonly<Record<string, readonly [HowToPlaySlide, HowToPlaySlide, HowToPlaySlide]>> = {
  'pokedex-distance': steps(
    ['Te damos un número de Pokédex', 'Cada ronda sale un objetivo, por ejemplo el #025.', Target, 'berry'],
    ['Elige el Pokémon cuyo número esté más cerca', 'Búscalo por su nombre: el buscador no muestra números.', Search, 'aqua'],
    ['El más lejano cae. El último en pie gana', 'Si no respondes, caes. Los empates se desempatan; tras 3, cae quien eligió el último.', UserX, 'electric'],
  ),
  'shiny-vote': steps(
    ['Uno de estos es el shiny oficial', 'Verás entre 3 y 6 cartas en cada ronda.', Sparkles, 'electric'],
    ['Los demás están recoloreados', 'Fíjate en los colores del shiny de verdad.', Palette, 'aqua'],
    ['Cuanto antes aciertes, más puntos (4/3/2/1)', 'Los tres primeros en acertar suman bonus.', Timer, 'leaf'],
  ),
  'pokemon-impostor': steps(
    ['Todos menos el impostor ven el Pokémon', 'El impostor no lo sabe e intenta disimular.', Eye, 'aqua'],
    ['Da una pista corta sin decir el nombre', 'Por turnos y con 25 caracteres como máximo.', MessageSquareText, 'electric'],
    ['Votad al sospechoso; el impostor gana si adivina el Pokémon o iguala en número', 'Puedes votar «Saltar», pero 3 rondas seguidas sin expulsar a nadie dan la victoria a los impostores.', Vote, 'berry'],
  ),
  'higher-lower': steps(
    ['Mira la stat del Pokémon de la izquierda', 'La categoría puede cambiar en cada ronda.', BarChart3, 'aqua'],
    ['¿El de la derecha la tiene mayor, menor o igual?', 'Responde antes de que se acabe el tiempo.', ArrowUpDown, 'electric'],
    ['Igual vale más puntos y las rachas dan bonus', 'Acertar en la primera mitad de la ronda suma +1.', Flame, 'berry'],
  ),
  'type-duel': steps(
    ['Cada uno elige un tipo en secreto', 'Los dos tipos se revelan a la vez. Si no eliges a tiempo y tu rival sí, gana él.', LockKeyhole, 'berry'],
    ['Juntos forman una combinación: encuentra un Pokémon que la tenga EXACTA', 'Si elegís el mismo tipo, vale un Pokémon de ese único tipo.', Swords, 'aqua'],
    ['El primero que acierte gana 5 puntos', 'Tras un fallo esperas un segundo antes de volver a probar.', Trophy, 'electric'],
  ),
  'learnset-guess': steps(
    ['Ves los movimientos que aprende un Pokémon por nivel', 'Empiezas con unos pocos movimientos.', BookOpen, 'aqua'],
    ['Cada 7 s se revelan más', 'Cada pista nueva baja lo que vale acertar.', Clock3, 'electric'],
    ['Cuanto antes aciertes, más puntos', 'Los dos primeros en acertar suman bonus.', Zap, 'leaf'],
  ),
};
