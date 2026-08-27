import { ArrowLeft, ArrowRight, Crown, Gamepad2, Headphones, KeyRound, SlidersHorizontal, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';

const slides = [
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
    eyebrow: '2 · Hablar es mejor',
    title: 'Conecta una llamada con tus amigos',
    description: 'Recomendamos estar en una llamada de voz, por ejemplo en Discord, Zoom o vuestra app favorita. Muchos juegos ganan muchísimo cuando podéis comentar y reíros juntos.',
    visual: <div className="flex w-full max-w-sm items-center gap-4 rounded-xl border border-berry/20 bg-berry/[.07] p-4" aria-hidden="true">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-berry text-white shadow-card"><Headphones size={34} /></span>
      <span><strong className="font-display text-xl">Llamada de voz</strong><small className="mt-1 block font-bold text-ink/60">Discord · Zoom · Meet · Telegram</small><span className="mt-2 inline-flex items-center gap-1 text-xs font-black text-leaf"><span className="h-2 w-2 rounded-full bg-leaf" /> Grupo conectado</span></span>
    </div>,
  },
  {
    eyebrow: '3 · Prepara la partida',
    title: 'Elige juego, modo y configuración',
    description: 'En el lobby podéis leer cada juego antes de elegirlo. La persona anfitriona configura sus reglas y decide cómo rota la sesión.',
    visual: <div className="w-full max-w-sm overflow-hidden rounded-xl border border-ink/10 bg-surface" aria-hidden="true">
      <div className="flex border-b border-ink/10 bg-surface-raised p-1.5 text-xs font-black"><span className="flex-1 rounded-lg bg-aqua px-2 py-2 text-center text-night">Minijuego</span><span className="flex-1 px-2 py-2 text-center text-ink/55">Configuración</span><span className="flex-1 px-2 py-2 text-center text-ink/55">Modo</span></div>
      <div className="space-y-2 p-3"><div className="flex items-center gap-2 rounded-lg bg-aqua/[.08] p-2"><Gamepad2 className="text-aqua" size={20} /><strong className="text-sm">Pokémon Connections</strong></div><div className="flex items-center gap-2 rounded-lg bg-ink/[.04] p-2"><SlidersHorizontal className="text-berry" size={20} /><span className="text-sm font-bold">4 grupos · 120 segundos</span></div></div>
    </div>,
  },
  {
    eyebrow: '4 · A jugar',
    title: 'Compite, coopera y suma puntos',
    description: 'Cada minijuego tiene reglas propias. Las respuestas privadas se mantienen ocultas hasta el momento de la revelación.',
    visual: <div className="grid w-full max-w-sm grid-cols-3 gap-2" aria-hidden="true">
      <div className="rounded-xl bg-electric/15 p-3 text-center"><Sparkles className="mx-auto text-electric" /><strong className="mt-2 block text-sm">Descubre</strong></div>
      <div className="rounded-xl bg-aqua/10 p-3 text-center"><Users className="mx-auto text-aqua" /><strong className="mt-2 block text-sm">Comparte</strong></div>
      <div className="rounded-xl bg-leaf/10 p-3 text-center"><Crown className="mx-auto text-leaf" /><strong className="mt-2 block text-sm">Puntúa</strong></div>
    </div>,
  },
] as const;

export function HowToPlayCarousel() {
  const [active, setActive] = useState(0);
  const slide = slides[active]!;
  const previous = () => setActive((current) => (current - 1 + slides.length) % slides.length);
  const next = () => setActive((current) => (current + 1) % slides.length);

  return <aside className="flex min-h-[31rem] flex-col overflow-hidden rounded-2xl border border-aqua/20 bg-surface shadow-card" aria-labelledby="how-to-play-title">
    <header className="border-b border-ink/10 bg-gradient-to-r from-aqua/[.12] to-berry/[.08] px-5 py-4 sm:px-6">
      <span className="text-xs font-black uppercase tracking-[.18em] text-aqua">Guía rápida</span>
      <h2 id="how-to-play-title" className="font-display text-2xl sm:text-3xl">Cómo jugar</h2>
    </header>
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-6 text-center sm:px-8" aria-live="polite">
      <div className="flex min-h-48 w-full items-center justify-center">{slide.visual}</div>
      <span className="mt-4 text-xs font-black uppercase tracking-[.16em] text-berry">{slide.eyebrow}</span>
      <h3 className="mt-1 max-w-md font-display text-2xl leading-tight">{slide.title}</h3>
      <p className="mt-3 max-w-lg text-sm font-semibold leading-relaxed text-ink/65 sm:text-base">{slide.description}</p>
    </div>
    <footer className="flex items-center justify-between gap-3 border-t border-ink/10 px-4 py-3 sm:px-5">
      <button type="button" className="btn-ghost !min-h-10 !px-3" onClick={previous} aria-label="Consejo anterior"><ArrowLeft size={18} /> <span className="hidden sm:inline">Anterior</span></button>
      <div className="flex items-center gap-2" aria-label={`Consejo ${active + 1} de ${slides.length}`}>{slides.map((item, index) => <button key={item.eyebrow} type="button" onClick={() => setActive(index)} aria-label={`Ver consejo ${index + 1}`} aria-current={index === active ? 'step' : undefined} className={`h-2.5 rounded-full transition-[width,background-color] ${index === active ? 'w-7 bg-aqua' : 'w-2.5 bg-ink/20 hover:bg-ink/35'}`} />)}</div>
      <button type="button" className="btn-ghost !min-h-10 !px-3" onClick={next}><span className="hidden sm:inline">Siguiente</span> <ArrowRight size={18} /></button>
    </footer>
  </aside>;
}
