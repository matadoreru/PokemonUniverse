import { DoorOpen, KeyRound, LoaderCircle, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../room/RoomContext';

export function PlayPage() {
  const { createRoom, joinRoom, connected, room } = useRoom();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await operation(); navigate('/room'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se ha podido completar la operación.'); }
    finally { setBusy(false); }
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) { setError('Introduce un código de sala de 6 caracteres.'); return; }
    await run(() => joinRoom(code));
  }

  if (room) return <section className="mx-auto max-w-xl px-5 py-16 text-center">
    <div className="card">
      <DoorOpen className="mx-auto text-aqua" size={48} />
      <h1 className="mt-4 font-display text-3xl font-bold">Ya tienes una sala activa</h1>
      <p className="mt-2 font-semibold text-ink/55">Código <strong className="tracking-widest text-ink">{room.code}</strong></p>
      <button className="btn-primary mt-6 w-full sm:w-auto" onClick={() => navigate('/room')}>Volver a la sala</button>
    </div>
  </section>;

  return <section className="mx-auto max-w-xl px-5 pb-16 pt-8 sm:pt-12">
    <header className="mb-7 text-center">
      <span className="label !mb-2 text-aqua">Multijugador privado</span>
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Entrar en partida</h1>
      <p className="mx-auto mt-3 max-w-md font-semibold text-ink/55">Crea una sala nueva o utiliza el código que te ha enviado otro entrenador.</p>
    </header>

    <article className="card !p-5 sm:!p-8">
      <button className="btn-secondary w-full" disabled={busy || !connected} onClick={() => void run(createRoom)}>
        {busy ? <LoaderCircle className="animate-spin" size={20} /> : <Plus size={21} />}
        {busy ? 'Preparando sala…' : 'Crear sala privada'}
      </button>
      <p className="mt-2 text-center text-sm font-bold text-ink/40">Se crea al instante con la configuración predeterminada.</p>

      <div className="my-7 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-ink/10" />
        <span className="text-xs font-black uppercase tracking-[.2em] text-ink/35">O únete a una sala</span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>

      <form onSubmit={join}>
        <label htmlFor="room-code" className="mb-2 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-extrabold"><KeyRound size={18} className="text-aqua" /> Código de sala</span>
          <span className="text-xs font-black tabular-nums text-ink/35">{code.length}/6</span>
        </label>
        <input
          id="room-code"
          aria-describedby="room-code-help"
          className="field text-center font-display text-2xl uppercase tracking-[.32em] sm:text-3xl"
          value={code}
          onChange={(event) => { setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)); setError(''); }}
          placeholder="PIKA42"
          autoComplete="off"
          spellCheck={false}
          required
          minLength={6}
          maxLength={6}
        />
        <p id="room-code-help" className="mt-2 text-sm font-bold text-ink/40">Seis letras o números, sin espacios.</p>
        <button className="btn-primary mt-4 w-full" disabled={busy || !connected || code.length !== 6}>
          {busy ? <LoaderCircle className="animate-spin" size={20} /> : <DoorOpen size={20} />}
          {busy ? 'Entrando…' : 'Unirse a la sala'}
        </button>
      </form>

      {error && <p role="alert" className="mt-4 rounded-xl border border-berry/25 bg-berry/10 p-3 text-center text-sm font-extrabold text-berry">{error}</p>}
    </article>

    <p className="mt-5 text-center text-sm font-bold text-ink/40">El host podrá elegir el minijuego y configurar la partida desde el lobby.</p>
  </section>;
}
