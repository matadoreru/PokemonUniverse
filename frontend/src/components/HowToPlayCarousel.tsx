import { ArrowLeft, ArrowRight, Crown, Gamepad2, Headphones, KeyRound, SlidersHorizontal, Sparkles, Users } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';

/** Una diapositiva del carrusel: antetítulo («Paso 1 de 3»), título, descripción de una línea y visual decorativo. */
export interface HowToPlaySlide { eyebrow: string; title: string; description: string; visual: ReactNode }

/** Guía general de la pantalla de entrada (4 consejos). */
const generalSlides: readonly HowToPlaySlide[] = [
  {
    eyebrow: '1 · Reúne al grupo',
    title: 'Crea una sala o entra con un código',
    description: 'La persona anfitriona comparte un código de seis caracteres y el resto se une desde esta misma pantalla.',
    visual: <div className="grid w-full max-w-sm gap-3" aria-hidden="true">
      <div className="flex items-center gap-3 rounded-xl border border-aqua/25 bg-aqua/[.08] p-3"><Crown className="text-electric" /><span className="min-w-0 flex-1"><strong className="block">Crea la sala</strong><small className="font-bold text-ink/55">Tú eliges juego y ajustes</small></span></div>
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 bg-surface px-4 py-3 font-display text-xl tracking-[.28em]"><KeyRound className="text-aqua" size={20} /> PIKA42</div>
      <div className="flex justify-center -space-x-2"><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-berry text-sm font-black text-white">A</span><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-aqua text-sm font-black text-night">P</span><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-electric text-sm font-black text-night">+3</span></div>
    </div>,
  },
  {
    eyebrow: '2 · En llamada mejor',
    title: 'Conectate a una llamada con tus amigos',
    description: 'Recomendamos estar en una llamada de voz, por ejemplo en Discord, Zoom o vuestra app favorita. Muchos juegos ganan muchísimo cuando podéis comentar y reíros juntos.',
    visual: <div className="flex w-full max-w-sm items-center gap-4 rounded-xl border border-berry/20 bg-berry/[.07] p-4" aria-hidden="true">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-berry text-white shadow-card"><Headphones size={34} /></span>
      <span><strong className="font-display text-xl">Llamada de voz</strong><small className="mt-1 block font-bold text-ink/60">Discord · Zoom · Meet · Telegram</small><span className="mt-2 inline-flex items-center gap-1 text-xs font-black text-leaf"><span className="h-2 w-2 rounded-full bg-leaf" /> Grupo conectado</span></span>
    </div>,
  },
  {
    eyebrow: '3 · Prepara la partida',
    title: 'Elige juego, modo y configuración',
    description: 'En el lobby podéis leer cada juego antes de elegirlo. La persona anfitriona configura sus reglas (cada minijuego tiene las suyas propias) y decide cómo rota la sesión (los modos de rotacion random y votacion recomendamos configurar los minijuegos uno a uno para mejor experie).',
    visual: <div className="w-full max-w-sm overflow-hidden rounded-xl border border-ink/10 bg-surface" aria-hidden="true">
      <div className="flex border-b border-ink/10 bg-surface-raised p-1.5 text-xs font-black"><span className="flex-1 rounded-lg bg-aqua px-2 py-2 text-center text-night">Minijuego</span><span className="flex-1 px-2 py-2 text-center text-ink/55">Configuración</span><span className="flex-1 px-2 py-2 text-center text-ink/55">Modo</span></div>
      <div className="space-y-2 p-3"><div className="flex items-center gap-2 rounded-lg bg-aqua/[.08] p-2"><Gamepad2 className="text-aqua" size={20} /><strong className="text-sm">Pokémon Connections</strong></div><div className="flex items-center gap-2 rounded-lg bg-ink/[.04] p-2"><SlidersHorizontal className="text-berry" size={20} /><span className="text-sm font-bold">4 grupos · 120 segundos</span></div></div>
    </div>,
  },
  {
    eyebrow: '4 · A jugar',
    title: 'Juega con o contra tus amigos',
    description: 'Cada minijuego tiene reglas propias. Juega y divertete!',
    visual: <div className="grid w-full max-w-sm grid-cols-3 gap-2" aria-hidden="true">
      <div className="rounded-xl bg-electric/15 p-3 text-center"><Sparkles className="mx-auto text-electric" /><strong className="mt-2 block text-sm">Descubre</strong></div>
      <div className="rounded-xl bg-aqua/10 p-3 text-center"><Users className="mx-auto text-aqua" /><strong className="mt-2 block text-sm">Comparte</strong></div>
      <div className="rounded-xl bg-leaf/10 p-3 text-center"><Crown className="mx-auto text-leaf" /><strong className="mt-2 block text-sm">Puntúa</strong></div>
    </div>,
  },
];

interface Props {
  /** Diapositivas; sin ellas, la guía general de 4 consejos. */
  slides?: readonly HowToPlaySlide[];
  heading?: string;
  kicker?: string;
  /** Contenido bajo la navegación (por ejemplo, «Saltar» en la intro de partida). */
  footer?: ReactNode;
  /** Acción a la derecha de la cabecera (por ejemplo, «Cerrar» en un diálogo). */
  headerAction?: ReactNode;
  /** Prefijo de los ids, para que dos carruseles en la misma página no los repitan. */
  idPrefix?: string;
  /** Nombre de cada diapositiva en las etiquetas: «Ver consejo 2», «Paso anterior»… */
  itemLabel?: string;
}

/**
 * Carrusel accesible sin reproducción automática: flechas, puntos de 44 px y teclas ← → sobre la región.
 * Pinta todas las diapositivas y oculta las inactivas con `hidden`, así el contenido existe sin JavaScript.
 */
export function HowToPlayCarousel({ slides = generalSlides, heading = 'Cómo jugar', kicker = 'Guía rápida', footer, headerAction, idPrefix = 'how-to-play', itemLabel = 'consejo' }: Props) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  const count = slides.length;
  const go = (index: number, towards: 'next' | 'previous') => { setDirection(towards); setActive((index + count) % count); };
  const previous = () => go(active - 1, 'previous');
  const next = () => go(active + 1, 'next');
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  };
  const label = itemLabel.charAt(0).toLocaleUpperCase('es') + itemLabel.slice(1);
  const titleId = `${idPrefix}-title`;

  return <section className="flex min-h-[31rem] flex-col overflow-hidden rounded-2xl border border-aqua/20 bg-surface shadow-card" aria-labelledby={titleId} aria-roledescription="carrusel" onKeyDown={onKeyDown}>
    <header className="flex items-start justify-between gap-3 border-b border-ink/10 bg-gradient-to-r from-aqua/[.12] to-berry/[.08] px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <span className="text-xs font-black uppercase tracking-[.18em] text-aqua">{kicker}</span>
        <h2 id={titleId} className="font-display text-2xl sm:text-3xl">{heading}</h2>
      </div>
      {headerAction}
    </header>
    <div className="flex flex-1 flex-col px-5 py-6 text-center sm:px-8" aria-live="polite">
      {slides.map((slide, index) => <div key={slide.eyebrow} id={`${idPrefix}-slide-${index + 1}`} role="group" aria-roledescription="diapositiva" aria-label={`${label} ${index + 1} de ${count}`} hidden={index !== active} className={`${index === active ? 'flex' : 'hidden'} flex-1 flex-col items-center justify-center ${direction === 'next' ? 'motion-enter-right' : 'motion-enter-left'}`}>
        <div className="flex min-h-48 w-full items-center justify-center">{slide.visual}</div>
        <span className="mt-4 text-xs font-black uppercase tracking-[.16em] text-berry">{slide.eyebrow}</span>
        <h3 className="mt-1 max-w-md font-display text-2xl leading-tight">{slide.title}</h3>
        <p className="mt-3 max-w-lg text-sm font-semibold leading-relaxed text-ink/65 sm:text-base">{slide.description}</p>
      </div>)}
    </div>
    <nav className="flex items-center justify-between gap-2 border-t border-ink/10 px-4 py-3 sm:px-5" aria-label={`${label}s de ${heading}`}>
      <button type="button" className="btn-ghost !px-3" onClick={previous} aria-label={`${label} anterior`}><ArrowLeft size={18} /> <span className="hidden sm:inline">Anterior</span></button>
      <div className="flex items-center" role="group" aria-label={`${label} ${active + 1} de ${count}`}>{slides.map((item, index) => <button key={item.eyebrow} type="button" onClick={() => go(index, index < active ? 'previous' : 'next')} aria-label={`Ver ${itemLabel} ${index + 1}`} aria-controls={`${idPrefix}-slide-${index + 1}`} aria-current={index === active ? 'step' : undefined} className="group grid min-h-11 min-w-11 place-items-center rounded-full"><span className={`block h-2.5 w-2.5 rounded-full ${index === active ? 'scale-x-[2.6] bg-aqua' : 'bg-ink/20 group-hover:bg-ink/35'}`} /></button>)}</div>
      <button type="button" className="btn-ghost !px-3" onClick={next} aria-label={`Siguiente ${itemLabel}`} data-carousel-next=""><span className="hidden sm:inline">Siguiente</span> <ArrowRight size={18} /></button>
    </nav>
    {footer && <div className="border-t border-ink/10 px-4 py-3 sm:px-5">{footer}</div>}
  </section>;
}
