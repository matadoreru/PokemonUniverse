import { Copy, DoorOpen, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../room/RoomContext';

export function PlayPage() {
  const { createRoom, joinRoom, connected, room } = useRoom(); const navigate = useNavigate();
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function run(operation: () => Promise<unknown>) { setBusy(true); setError(''); try { await operation(); navigate('/room'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Error'); } finally { setBusy(false); } }
  async function join(event: FormEvent) { event.preventDefault(); await run(() => joinRoom(code)); }
  if (room) return <section className="mx-auto max-w-xl px-5 py-20 text-center"><div className="card"><DoorOpen className="mx-auto text-aqua" size={48} /><h1 className="mt-4 font-display text-3xl font-bold">Ya tienes una sala activa</h1><p className="mt-2 font-semibold text-ink/55">Código <strong>{room.code}</strong></p><button className="btn-primary mt-6" onClick={() => navigate('/room')}>Volver a la sala</button></div></section>;
  return <section className="mx-auto max-w-5xl px-5 py-12">
    <div className="mb-9 text-center"><span className={`chip ${connected ? 'bg-leaf/15 text-leaf' : 'bg-berry/15 text-berry'}`}>{connected ? '● Servidor conectado' : '○ Conectando…'}</span><h1 className="mt-4 font-display text-4xl font-bold">¿Dónde jugamos?</h1><p className="mt-2 font-semibold text-ink/55">Abre una sala nueva o entra con el código de tu equipo.</p></div>
    <div className="grid gap-6 md:grid-cols-2">
      <article className="card flex flex-col items-center text-center"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-electric"><Plus size={32} /></div><h2 className="mt-5 font-display text-2xl font-bold">Crear sala</h2><p className="mt-2 flex-1 font-semibold text-ink/55">Tendrás los controles de host para elegir juego, reglas y formato de sesión.</p><button className="btn-secondary mt-7 w-full" disabled={busy || !connected} onClick={() => void run(createRoom)}>Crear sala privada</button></article>
      <article className="card flex flex-col items-center text-center"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-aqua"><Copy size={29} /></div><h2 className="mt-5 font-display text-2xl font-bold">Unirse con código</h2><p className="mt-2 font-semibold text-ink/55">Introduce los seis caracteres que aparecen en la pantalla del host.</p><form className="mt-6 w-full" onSubmit={join}><input aria-label="Código de sala" className="field text-center font-display text-2xl uppercase tracking-[.3em]" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))} placeholder="PIKA42" required minLength={6} /><button className="btn-primary mt-3 w-full" disabled={busy || !connected}>Entrar</button></form></article>
    </div>
    {error && <p className="mx-auto mt-6 max-w-lg rounded-xl bg-berry/10 p-3 text-center font-bold text-berry">{error}</p>}
  </section>;
}
