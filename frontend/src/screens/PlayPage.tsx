import { DoorOpen, KeyRound, LoaderCircle, LogOut, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { HowToPlayCarousel } from '../components/HowToPlayCarousel';
import { useRoom } from '../room/RoomContext';

export function PlayPage() {
  const { createRoom, joinRoom, leaveRoom, connected, room } = useRoom();
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

  async function leave() {
    setBusy(true);
    setError('');
    try { await leaveRoom(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se ha podido salir de la sala.'); }
    finally { setBusy(false); }
  }

  if (room) return <section className="mx-auto max-w-xl px-4 py-10 text-center sm:px-5 sm:py-16">
    <div className="card">
      <DoorOpen className="mx-auto text-aqua" size={48} />
      <h1 className="mt-4 font-display text-3xl font-bold">Ya tienes una sala activa</h1>
      <p className="mt-2 font-semibold text-ink/65">Código <strong className="tracking-widest text-ink">{room.code}</strong></p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => navigate('/room')}>Volver a la sala</button>
        <button type="button" className="btn-ghost w-full sm:w-auto" disabled={busy || !connected} onClick={() => void leave()}>
          {busy ? <LoaderCircle className="animate-spin" size={18} /> : <LogOut size={18} />}
          {busy ? 'Saliendo…' : 'Salir de la sala'}
        </button>
      </div>
      {error && <p role="alert" className="status-error mt-4">{error}</p>}
    </div>
  </section>;

  return <section className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-5 sm:pb-16 sm:pt-10">
    <header className="mb-7 text-center">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Entrar en partida</h1>
      <p className="mx-auto mt-3 max-w-md font-semibold text-ink/65">Crea una sala nueva o únete a una existente.</p>
    </header>

    <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <div className="flex flex-col">
        <article className="card flex-1 !p-4 sm:!p-6">
          <button className="btn-secondary w-full" disabled={busy || !connected} onClick={() => void run(createRoom)}>
            {busy ? <LoaderCircle className="animate-spin" size={20} /> : <Plus size={21} />}
            {busy ? 'Preparando sala…' : 'Crear sala privada'}
          </button>

          <div className="my-7 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-ink/10" />
            <span className="text-xs font-black uppercase tracking-[.2em] text-ink/55">O únete a una sala</span>
            <span className="h-px flex-1 bg-ink/10" />
          </div>

          <form onSubmit={join}>
            <label htmlFor="room-code" className="mb-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-extrabold"><KeyRound size={18} className="text-aqua" /> Código de sala</span>
              <span className="text-xs font-black tabular-nums text-ink/55">{code.length}/6</span>
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
            <button className="btn-primary mt-4 w-full" disabled={busy || !connected || code.length !== 6}>
              {busy ? <LoaderCircle className="animate-spin" size={20} /> : <DoorOpen size={20} />}
              {busy ? 'Entrando…' : 'Unirse a la sala'}
            </button>
          </form>

          {error && <p role="alert" className="status-error mt-4 text-center">{error}</p>}
        </article>
      </div>
      <HowToPlayCarousel />
    </div>
  </section>;
}
