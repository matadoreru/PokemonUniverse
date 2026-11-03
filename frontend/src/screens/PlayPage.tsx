import { Crown, DoorOpen, Gamepad2, KeyRound, LogOut, Plus, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../room/RoomContext';
import { normalizeRoomCode, ROOM_CODE_LENGTH, roomErrorMessage } from '../room/roomCode';
import { Field, Icon, Panel, Pill, StateBox } from '../ui';

type Busy = 'create' | 'join' | 'leave' | null;
const CODE_ID = 'room-code';

/** Título de panel con su icono. */
function PanelTitle({ icon, children }: { icon: typeof Crown; children: string }) {
  return <span className="flex items-center gap-2"><Icon icon={icon} size={18} />{children}</span>;
}

/**
 * Jugar (spec §6): crear una sala o unirse con su código, en dos paneles crema lado a lado (apilados en móvil),
 * centrados en la pantalla. En escritorio cabe sin scroll.
 * Si ya hay una sala activa, solo se ofrece volver a ella o salir.
 */
export function PlayPage() {
  const { createRoom, joinRoom, leaveRoom, connected, room } = useRoom();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);

  // Foco inicial en el código solo con puntero fino: en móvil abriría el teclado sin pedirlo.
  useEffect(() => {
    if (!room && window.matchMedia?.('(pointer: fine)').matches) codeInput.current?.focus();
  }, [room]);

  /** Un intento nuevo (crear o unirse) borra los errores de los dos paneles: solo se ve el del último. */
  function resetErrors() {
    setCreateError(''); setJoinError('');
  }

  async function create() {
    setBusy('create'); resetErrors();
    // createRoom y joinRoom no pasan su fallo al aviso global de la sala: aquí se enseña traducido, en su panel.
    try { await createRoom(); navigate('/room'); }
    catch (caught) { setCreateError(roomErrorMessage(caught)); }
    finally { setBusy(null); }
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    resetErrors();
    if (code.length !== ROOM_CODE_LENGTH) {
      const missing = ROOM_CODE_LENGTH - code.length;
      setJoinError(code.length === 0 ? 'Escribe el código de la sala.' : `Faltan ${missing} ${missing === 1 ? 'carácter' : 'caracteres'} del código.`);
      codeInput.current?.focus();
      return;
    }
    setBusy('join');
    try { await joinRoom(code); navigate('/room'); }
    catch (caught) { setJoinError(roomErrorMessage(caught)); codeInput.current?.focus(); }
    finally { setBusy(null); }
  }

  async function leave() {
    setBusy('leave'); setLeaveError('');
    try { await leaveRoom({ reportError: false }); }
    catch (caught) { setLeaveError(roomErrorMessage(caught)); }
    finally { setBusy(null); }
  }

  if (room) return (
    <div className="mx-auto grid w-full max-w-[1600px] px-4 pb-6 pt-6 sm:px-6 lg:px-8 lg:pt-[clamp(1rem,12dvh,10rem)]">
      {/* Sin alto completo: encima va la fila de la sala (reportar, saltar), que también ocupa el `main`. */}
      <Panel variant="cream" aria-labelledby="sala-activa-title" className="w-full max-w-[520px] justify-self-center">
        <div className="flex flex-col items-center gap-4 px-2 pb-2 pt-3 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-[color:var(--navy)] bg-[color:var(--yellow)] text-[color:var(--navy)]"><Icon icon={DoorOpen} size={32} /></span>
          <h1 id="sala-activa-title" className="font-display text-26 font-extrabold text-[color:var(--navy)] sm:text-34">Ya tienes una sala activa</h1>
          <p className="text-15 font-bold text-[color:var(--ink-2)]">
            Código <strong className="ml-1 font-display text-26 tracking-[.3em] text-[color:var(--ink)]">{room.code}</strong>
          </p>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Pill variant="yellow" icon={DoorOpen} disabled={busy !== null} onClick={() => navigate('/room')}>Volver a la sala</Pill>
            <Pill variant="cream" icon={LogOut} loading={busy === 'leave'} disabled={busy !== null || !connected} onClick={() => void leave()}>Salir de la sala</Pill>
          </div>
          {leaveError && <div className="w-full"><StateBox kind="error" title="No se pudo salir de la sala" text={leaveError} onCream /></div>}
        </div>
      </Panel>
    </div>
  );

  const off = busy !== null || !connected;
  return (
    <div className="mx-auto grid w-full max-w-[1100px] px-4 pb-6 pt-6 sm:px-6 lg:h-full lg:content-center lg:px-8 lg:py-6 2xl:max-w-[1300px]">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="text-center lg:text-left">
          <h1 className="ol2 font-display text-34 font-extrabold text-[color:var(--white)] lg:text-44 2xl:text-68">Entrar en partida</h1>
          <p className="mt-2 text-18 font-extrabold text-[color:var(--sky-2)] 2xl:mt-3 2xl:text-22">Crea tu sala o entra en la de tu grupo con su código.</p>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          <Panel
            variant="cream"
            title={<PanelTitle icon={Crown}>Crear sala</PanelTitle>}
            aria-label="Crear sala"
            bodyClassName="flex flex-col"
            status={createError ? { kind: 'error', title: 'No se pudo crear la sala', text: createError, action: { label: 'Reintentar', onClick: () => void create() } } : null}
          >
            <div className="flex flex-1 flex-col gap-4 px-1 pb-1 pt-2 2xl:gap-5 2xl:px-3 2xl:pb-3 2xl:pt-4">
              <ul className="flex flex-col gap-2 text-15 font-bold text-[color:var(--ink)] 2xl:gap-3 2xl:text-18">
                <li className="flex items-center gap-2"><Icon icon={Gamepad2} size={18} className="shrink-0 text-[color:var(--blue-d)]" />Eliges el minijuego y sus ajustes</li>
                <li className="flex items-center gap-2"><Icon icon={KeyRound} size={18} className="shrink-0 text-[color:var(--blue-d)]" />Compartes un código de 6 caracteres</li>
                <li className="flex items-center gap-2"><Icon icon={Users} size={18} className="shrink-0 text-[color:var(--blue-d)]" />Tu grupo entra y empezáis a jugar</li>
              </ul>
              <Pill variant="yellow" size="main" icon={Plus} block className="mt-auto" loading={busy === 'create'} disabled={off} onClick={() => void create()}>¡Crear sala!</Pill>
            </div>
          </Panel>
          <Panel variant="cream" title={<PanelTitle icon={DoorOpen}>Unirse con código</PanelTitle>} aria-label="Unirse con código" bodyClassName="flex flex-col">
            <form className="flex flex-1 flex-col gap-4 px-1 pb-1 pt-2 2xl:gap-5 2xl:px-3 2xl:pb-3 2xl:pt-4" noValidate onSubmit={(event) => void join(event)}>
              <Field
                ref={codeInput}
                id={CODE_ID}
                code
                label="Código de sala"
                hint="Seis letras o números."
                error={joinError || null}
                value={code}
                placeholder="······"
                enterKeyHint="go"
                inputMode="text"
                onChange={(event) => { setCode(normalizeRoomCode(event.target.value)); setJoinError(''); }}
              />
              <Pill type="submit" variant="blue" icon={DoorOpen} block className="mt-auto" loading={busy === 'join'} disabled={off}>Unirse a la sala</Pill>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
