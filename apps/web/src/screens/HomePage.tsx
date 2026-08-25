import { ArrowRight, Gamepad2, UsersRound, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { user } = useAuth();
  return <section className="mx-auto grid min-h-[calc(100vh-12rem)] max-w-7xl items-center gap-10 px-5 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:px-8 md:py-16">
      <div className="max-w-3xl">
        <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-aqua/10 px-3 py-1.5 text-sm font-extrabold text-aqua"><UsersRound size={16} />Minijuegos multijugador</span>
        <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-[-.03em] sm:text-5xl lg:text-6xl">Colección de minijuegos Pokémon, <span className="text-berry">en una sola sala.</span></h1>
        <p className="mt-5 max-w-[65ch] text-lg font-semibold leading-relaxed text-ink/70">Crea una sala privada, invita a tus amigos y juega minijuegos juntos.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="btn-primary" to={user ? '/play' : '/auth'}>{user ? 'Ir a las salas' : 'Empezar a jugar'} <ArrowRight size={20} /></Link>
          {!user && <Link className="btn-ghost" to="/auth?mode=guest">Entrar como invitado</Link>}
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-ink/10 pt-5 text-sm font-bold text-ink/65">
          <span className="inline-flex items-center gap-2"><Zap size={17} className="text-electric" /> Sin instalaciones</span>
          <span className="inline-flex items-center gap-2"><Gamepad2 size={17} className="text-aqua" /> Minijuegos</span>
          <span className="inline-flex items-center gap-2"><UsersRound size={17} className="text-leaf" /> Salas privadas</span>
        </div>
      </div>
      <div className="pokeball-mark mx-auto h-32 w-32 border-4 border-ink sm:h-36 sm:w-36" aria-hidden="true" />
    </section>;
}
