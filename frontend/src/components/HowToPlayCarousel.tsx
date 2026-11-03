import { ArrowLeft, ArrowRight, Crown, Gamepad2, Headphones, KeyRound, SlidersHorizontal, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Badge, Chip, cx, Icon, Pill } from '../ui';
import s from './HowToPlayCarousel.module.css';

/** Una diapositiva del carrusel: antetítulo («Paso 1 de 3»), título, descripción de una línea y visual decorativo. */
export interface HowToPlaySlide { eyebrow: string; title: string; description: string; visual: ReactNode }

export type HowToPlayTone = 'red' | 'blue' | 'yellow' | 'green';

/** Medallón decorativo de un paso: relleno sólido del tono, contorno y icono azul noche (se lee sobre azul y crema). */
export function HowToPlayMedallion({ icon: Glyph, tone }: { icon: LucideIcon; tone: HowToPlayTone }) {
  return <span className={cx(s.medallion, s[tone])} aria-hidden="true"><Glyph size={56} strokeWidth={2.5} /></span>;
}

/** Guía general de la pantalla de entrada (4 consejos). */
const generalSlides: readonly HowToPlaySlide[] = [
  {
    eyebrow: '1 · Reúne al grupo',
    title: 'Crea una sala o entra con un código',
    description: 'La persona anfitriona comparte un código de seis caracteres y el resto se une desde esta misma pantalla.',
    visual: <div className="grid w-full max-w-sm gap-3" aria-hidden="true">
      <div className={s.mock}><span className={cx(s.tile, s.yellow)}><Icon icon={Crown} size={22} /></span><span className="min-w-0 flex-1"><strong className={s.mockTitle}>Crea la sala</strong><small className={s.mockText}>Tú eliges juego y ajustes</small></span></div>
      <div className={s.code}><Icon icon={KeyRound} size={22} className={s.codeIcon} /> PIKA42</div>
      <div className={s.avatars}><span className={cx(s.avatar, s.red)}>A</span><span className={cx(s.avatar, s.blue)}>P</span><span className={cx(s.avatar, s.yellow)}>+3</span></div>
    </div>,
  },
  {
    eyebrow: '2 · En llamada mejor',
    title: 'Conectate a una llamada con tus amigos',
    description: 'Recomendamos estar en una llamada de voz, por ejemplo en Discord, Zoom o vuestra app favorita. Muchos juegos ganan muchísimo cuando podéis comentar y reíros juntos.',
    visual: <div className={cx(s.mock, 'max-w-sm !gap-4 !p-4')} aria-hidden="true">
      <span className={cx(s.tile, s.bigTile, s.red)}><Icon icon={Headphones} size={32} /></span>
      <span className="flex min-w-0 flex-col items-start gap-1"><strong className={s.mockTitle}>Llamada de voz</strong><small className={s.mockText}>Discord · Zoom · Meet · Telegram</small><Chip tone="ok">Grupo conectado</Chip></span>
    </div>,
  },
  {
    eyebrow: '3 · Prepara la partida',
    title: 'Elige juego, modo y configuración',
    description: 'En el lobby podéis leer cada juego antes de elegirlo. La persona anfitriona configura sus reglas (cada minijuego tiene las suyas propias) y decide cómo rota la sesión (los modos de rotacion random y votacion recomendamos configurar los minijuegos uno a uno para mejor experie).',
    visual: <div className={cx(s.sheet, 'max-w-sm')} aria-hidden="true">
      <div className={s.tabs}><span className={cx(s.tab, s.tabActive)}>Minijuego</span><span className={s.tab}>Configuración</span><span className={s.tab}>Modo</span></div>
      <div className={s.sheetRow}><span className={cx(s.tile, s.blue, '!h-8 !w-8')}><Icon icon={Gamepad2} size={18} /></span>Pokémon Connections</div>
      <div className={s.sheetRow}><span className={cx(s.tile, s.red, '!h-8 !w-8')}><Icon icon={SlidersHorizontal} size={18} /></span><Badge tone="navy">4 grupos</Badge><Badge tone="navy">120 s</Badge></div>
    </div>,
  },
  {
    eyebrow: '4 · A jugar',
    title: 'Juega con o contra tus amigos',
    description: 'Cada minijuego tiene reglas propias. Juega y divertete!',
    visual: <div className="grid w-full max-w-sm grid-cols-3 gap-2" aria-hidden="true">
      <div className={s.feature}><span className={cx(s.tile, s.yellow)}><Icon icon={Sparkles} size={22} /></span>Descubre</div>
      <div className={s.feature}><span className={cx(s.tile, s.blue)}><Icon icon={Users} size={22} /></span>Comparte</div>
      <div className={s.feature}><span className={cx(s.tile, s.green)}><Icon icon={Crown} size={22} /></span>Puntúa</div>
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
  /** Con bucle (por defecto), «Siguiente» en la última vuelve a la primera; sin él, se para en los extremos. */
  loop?: boolean;
  /** Sin bucle, sustituye a «Siguiente» en la última diapositiva (por ejemplo, «Entendido» o «Empezar»). */
  lastAction?: ReactNode;
  /** Más bajo (intro de partida): el carrusel, su navegación y la cabecera caben juntos a 1280×720 y 390×844. */
  compact?: boolean;
  /**
   * Dentro de un `Dialog`: sin cabecera ni marco propios (el título lo pone el diálogo y la región se nombra con
   * `heading`), y «Siguiente» recibe el foco al abrir (`data-autofocus`).
   */
  inDialog?: boolean;
  /** Sobre crema (el `Dialog`): título y texto en tinta oscura. Por defecto el carrusel va sobre azul. */
  onCream?: boolean;
}

/** Índice tras moverse `delta` posiciones: da la vuelta con bucle, se para en los extremos sin él y nunca sale de rango. */
export function carouselStep(active: number, count: number, loop: boolean, delta: number): number {
  const current = Math.min(Math.max(active, 0), count - 1);
  const target = current + delta;
  return loop ? (target + count) % count : Math.min(Math.max(target, 0), count - 1);
}

/**
 * Carrusel accesible sin reproducción automática: flechas, puntos de 44 px y teclas ← → sobre la región.
 * Pinta todas las diapositivas y oculta las inactivas con `hidden`, así el contenido existe sin JavaScript.
 */
export function HowToPlayCarousel({ slides = generalSlides, heading = 'Cómo jugar', kicker = 'Guía rápida', footer, headerAction, idPrefix = 'how-to-play', itemLabel = 'consejo', loop = true, lastAction, compact = false, inDialog = false, onCream = false }: Props) {
  const [storedActive, setActive] = useState(0);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  // Otras diapositivas (otro juego) vuelven a empezar por la primera.
  const [shownSlides, setShownSlides] = useState(slides);
  if (shownSlides !== slides) { setShownSlides(slides); setActive(0); }
  const count = slides.length;
  const active = carouselStep(storedActive, count, loop, 0);
  const isFirst = !loop && active === 0;
  const isLast = !loop && active === count - 1;
  const showLastAction = isLast && lastAction !== undefined;
  const lastActionRef = useRef<HTMLSpanElement>(null);
  const [focusLastAction, setFocusLastAction] = useState(false);
  useEffect(() => {
    // «Siguiente» desaparece al llegar al final: el foco pasa a la acción que lo sustituye.
    if (!focusLastAction) return;
    setFocusLastAction(false);
    lastActionRef.current?.querySelector<HTMLElement>('button, a, [tabindex]')?.focus();
  }, [focusLastAction]);
  const go = (index: number, towards: 'next' | 'previous') => { setDirection(towards); setActive(carouselStep(index, count, loop, 0)); };
  const previous = () => { if (!isFirst) go(carouselStep(active, count, loop, -1), 'previous'); };
  const next = () => {
    if (isLast) return;
    const target = carouselStep(active, count, loop, 1);
    if (!loop && target === count - 1 && lastAction !== undefined && lastActionRef.current === null && document.activeElement?.hasAttribute('data-carousel-next')) setFocusLastAction(true);
    go(target, 'next');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  };
  const label = itemLabel.charAt(0).toLocaleUpperCase('es') + itemLabel.slice(1);
  const titleId = `${idPrefix}-title`;

  return <section className={cx(s.root, onCream && s.onCream, !inDialog && s.framed, !inDialog && (compact ? 'min-h-[24rem]' : 'min-h-[31rem]'))} {...(inDialog ? { 'aria-label': heading } : { 'aria-labelledby': titleId })} aria-roledescription="carrusel" onKeyDown={onKeyDown}>
    {!inDialog && <header className={s.head}>
      <div className="min-w-0">
        <span className={s.kicker}>{kicker}</span>
        <h2 id={titleId} className={s.heading}>{heading}</h2>
      </div>
      {headerAction}
    </header>}
    <div className={`flex flex-1 flex-col px-5 text-center sm:px-8 ${compact ? 'py-4' : 'py-6'}`} aria-live="polite">
      {slides.map((slide, index) => <div key={slide.eyebrow} id={`${idPrefix}-slide-${index + 1}`} role="group" aria-roledescription="diapositiva" aria-label={`${label} ${index + 1} de ${count}`} hidden={index !== active} className={cx(s.slide, direction === 'next' ? 'motion-enter-right' : 'motion-enter-left')}>
        <div className={`flex w-full items-center justify-center ${compact ? 'min-h-28' : 'min-h-48'}`}>{slide.visual}</div>
        <span className="mt-4"><Badge>{slide.eyebrow}</Badge></span>
        <h3 className={s.title}>{slide.title}</h3>
        <p className={s.text}>{slide.description}</p>
      </div>)}
    </div>
    <nav className={s.nav} aria-label={`${label}s de ${heading}`}>
      <Pill variant="ghost" className={s.navPill} onClick={previous} aria-disabled={isFirst || undefined} aria-label={`${label} anterior`}><Icon icon={ArrowLeft} size={24} /><span className={s.navLabel}>Anterior</span></Pill>
      <div className={s.dots} role="group" aria-label={`${label} ${active + 1} de ${count}`}>{slides.map((item, index) => <button key={item.eyebrow} type="button" onClick={() => go(index, index < active ? 'previous' : 'next')} aria-label={`Ver ${itemLabel} ${index + 1}`} aria-controls={`${idPrefix}-slide-${index + 1}`} aria-current={index === active ? 'step' : undefined} className={s.dot}><span className={cx(s.dotMark, index === active && s.dotActive)} /></button>)}</div>
      {showLastAction
        ? <span ref={lastActionRef} className="flex">{lastAction}</span>
        : <Pill variant="ghost" className={s.navPill} onClick={next} aria-disabled={isLast || undefined} aria-label={`Siguiente ${itemLabel}`} data-carousel-next="" {...(inDialog ? { 'data-autofocus': '' } : {})}><span className={s.navLabel}>Siguiente</span><Icon icon={ArrowRight} size={24} /></Pill>}
    </nav>
    {footer && <div className={s.footer}>{footer}</div>}
  </section>;
}
