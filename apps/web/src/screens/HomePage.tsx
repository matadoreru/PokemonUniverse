import { ArrowRight, Gamepad2, UsersRound, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { user } = useAuth();
  return <section className="mx-auto grid min-h-[calc(100vh-12rem)] max-w-7xl items-center gap-10 px-5 py-10 md:grid-cols-[minmax(0,1.05fr)_minmax(22rem,.75fr)] md:px-8 md:py-16">
      <div className="max-w-3xl">
        <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-aqua/10 px-3 py-1.5 text-sm font-extrabold text-aqua"><UsersRound size={16} /> Minijuegos multijugador</span>
        <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-[-.03em] sm:text-5xl lg:text-6xl">Todo el universo Pokémon, <span className="text-berry">en una sola sala.</span></h1>
        <p className="mt-5 max-w-[65ch] text-lg font-semibold leading-relaxed text-ink/70">Crea una sala privada, invita a tus amigos y compite en partidas rápidas diseñadas para jugar juntos.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="btn-primary" to={user ? '/play' : '/auth'}>{user ? 'Ir a las salas' : 'Empezar a jugar'} <ArrowRight size={20} /></Link>
          {!user && <Link className="btn-ghost" to="/auth?mode=guest">Entrar como invitado</Link>}
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-ink/10 pt-5 text-sm font-bold text-ink/65">
          <span className="inline-flex items-center gap-2"><Zap size={17} className="text-electric" /> Sin instalaciones</span>
          <span className="inline-flex items-center gap-2"><Gamepad2 size={17} className="text-aqua" /> Modos para todos</span>
          <span className="inline-flex items-center gap-2"><UsersRound size={17} className="text-leaf" /> Salas privadas</span>
        </div>
      </div>
      <div className="panel mx-auto w-full max-w-md overflow-hidden" aria-label="Vista previa de una sala de juego">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4"><div><span className="text-sm font-bold text-ink/60">Sala preparada</span><strong className="block font-display text-xl">Noche Pokémon</strong></div><span className="chip bg-leaf/10 text-leaf">4 online</span></div>
        <div className="grid place-items-center px-6 py-10">
          <div className="pokeball-mark h-32 w-32 border-4 border-ink sm:h-36 sm:w-36" />
          <p className="mt-6 font-display text-2xl font-bold">Elige. Acierta. <span className="text-berry">Compite.</span></p>
          <p className="mt-1 text-center text-sm font-bold text-ink/60">Partidas ágiles, resultados claros y revancha inmediata.</p>
        </div>
        <div className="grid grid-cols-3 border-t border-ink/10 text-center text-sm font-extrabold"><span className="px-2 py-3">Lobby</span><span className="border-x border-ink/10 bg-aqua/10 px-2 py-3 text-aqua">Partida</span><span className="px-2 py-3">Resultados</span></div>
      </div>
    </section>;
}
