import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { user } = useAuth();
  return <div className="overflow-hidden">
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-10 md:grid-cols-[1.1fr_.9fr] md:px-8 md:pb-24 md:pt-20">
      <div>
        <h1 className="max-w-3xl font-display text-5xl font-bold leading-[.98] tracking-tight sm:text-6xl lg:text-7xl">PokemonUniverse<span className="text-berry"> para jugar juntos.</span></h1>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link className="btn-primary" to={user ? '/play' : '/auth'}>{user ? 'Ir a las salas' : 'Empezar a jugar'} <ArrowRight size={20} /></Link>
          {!user && <Link className="btn-ghost" to="/auth?mode=guest">Entrar como invitado</Link>}
        </div>
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-[470px]">
        <div className="absolute inset-[8%] rotate-6 rounded-[3.5rem] border-2 border-ink/20 bg-electric shadow-pop" />
        <div className="absolute inset-[4%_12%_12%_4%] -rotate-3 rounded-[3.5rem] border-2 border-ink/20 bg-aqua shadow-pop" />
        <div className="absolute inset-[12%_4%_4%_12%] grid place-items-center rounded-[3.5rem] border-2 border-ink/15 bg-surface shadow-pop">
          <div className="text-center"><div className="pokeball-mark mx-auto h-36 w-36 border-[5px] border-ink sm:h-44 sm:w-44" /><p className="mt-8 font-display text-3xl font-bold">OBJETIVO <span className="text-berry">#448</span></p></div>
        </div>
      </div>
    </section>
  </div>;
}
