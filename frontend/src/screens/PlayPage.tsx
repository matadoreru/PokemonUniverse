import { CalendarDays, Crown, DoorOpen, Gamepad2, KeyRound, LogOut, Plus, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { audio } from '../audio';
import { useAuth } from '../auth/AuthContext';
import { DailyPanel } from '../daily/DailyPanel';
import { ABANDON_DAILY_TEXT } from '../daily/daily-state';
import { useDailyOverview } from '../daily/useDailyOverview';
import { useRoom } from '../room/RoomContext';
import { parseRoomLinkCode, ROOM_LINK_PARAM } from '../room/room-link';
import { normalizeRoomCode, ROOM_CODE_LENGTH, roomErrorMessage } from '../room/roomCode';
import { ConfirmDialog, cx, Field, Icon, Panel, Pill, Screen, ScreenHeader, StateBox } from '../ui';
import tone from '../styles/tones.module.css';
import shape from '../styles/shapes.module.css';

type Busy = 'create' | 'join' | 'leave' | 'daily' | null;
const CODE_ID = 'room-code';

/** Título de panel con su icono. */
function PanelTitle({ icon, children }: { icon: typeof Crown; children: string }) {
  return <span className="flex items-center gap-2"><Icon icon={icon} size={18} />{children}</span>;
}

/**
 * Jugar (spec §6 y reto diario «Interfaz»): crear una sala, unirse con su código y el reto diario, en tres paneles crema
 * en columnas desde `lg` (apilados por debajo), centrados en la pantalla (`Screen`). En escritorio cabe sin scroll y
 * crece a 1536 y 1920 px. Si ya hay una sala activa, solo se ofrece volver a ella o salir, en una tarjeta centrada en el
 * hueco libre (con sus textos de reto si la sala es del reto). Una sala del reto ya en resultados se cierra sola.
 * Un enlace `/play?sala=CÓDIGO` rellena el código y entra en cuanto hay conexión (una vez por código; si ya estás en
 * otra sala, se queda en «Ya tienes una sala activa» y no sale de ella).
 */
export function PlayPage() {
  const { createRoom, joinRoom, leaveRoom, startDaily, connected, room: currentRoom } = useRoom();
  const { user } = useAuth();
  const navigate = useNavigate();
  // El reto ya terminado no es una sala activa: se cierra sola (abajo) y mientras tanto se ve Jugar normal.
  const finishedDaily = Boolean(currentRoom?.daily && currentRoom.phase === 'GAME_RESULTS');
  const room = finishedDaily ? null : currentRoom;
  const guest = user?.kind !== 'USER';
  const daily = useDailyOverview(!guest && !currentRoom);
  const [dailyError, setDailyError] = useState<unknown>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  // Una vez por sala: StrictMode repite los efectos y la sala sigue en el estado hasta que llega el ack.
  const closingRef = useRef<string | null>(null);
  const finishedKey = finishedDaily ? currentRoom?.roomInstanceId ?? currentRoom?.code ?? null : null;
  useEffect(() => {
    if (!finishedKey || closingRef.current === finishedKey) return;
    closingRef.current = finishedKey;
    // Si falla (p. ej. sin conexión), se suelta la guarda: el efecto vuelve a intentarlo cuando cambie el contexto (al reconectar).
    void leaveRoom({ reportError: false }).catch(() => { if (closingRef.current === finishedKey) closingRef.current = null; });
  }, [finishedKey, leaveRoom]);
  // Si la recarga tras un fallo de «Jugar» trae otro estado (ya jugado, en curso), el error ya no viene a cuento.
  const dailyStatus = daily.overview?.status;
  useEffect(() => { if (dailyStatus && dailyStatus !== 'AVAILABLE') setDailyError(null); }, [dailyStatus]);
  const [params, setParams] = useSearchParams();
  const linkCode = parseRoomLinkCode(params.get(ROOM_LINK_PARAM));
  const [code, setCode] = useState(() => linkCode ?? '');
  // El último código de enlace ya atendido: StrictMode repite el efecto y la sala tarda en llegar tras el ack.
  const linkHandled = useRef<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);

  // Foco inicial en el código solo con puntero fino: en móvil abriría el teclado sin pedirlo.
  useEffect(() => {
    if (!room && window.matchMedia?.('(pointer: fine)').matches) codeInput.current?.focus();
  }, [room]);

  /** Un intento nuevo (crear, unirse o el reto) borra los errores de los tres paneles: solo se ve el del último. */
  function resetErrors() {
    setCreateError(''); setJoinError(''); setDailyError(null);
  }

  async function playDaily() {
    setBusy('daily'); resetErrors();
    // Como «Crear sala»: `startDaily` no pasa su fallo al aviso global; se enseña traducido en el panel del reto.
    // El reto llega ya empezado: la sala no ve el cambio de partida (`GameStartCue` se monta con ella), así que su
    // `game.start` suena aquí, una vez.
    try { await startDaily(); audio.play('game.start'); navigate('/room'); }
    catch (caught) { setDailyError(caught); daily.reload(); }
    finally { setBusy(null); }
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
    await joinWith(code);
  }

  /** Une a la sala; desde un enlace, sustituye `/play?sala=` en el historial (Atrás no vuelve a entrar). */
  async function joinWith(target: string, fromLink = false) {
    setBusy('join');
    try { await joinRoom(target); navigate('/room', { replace: fromLink }); }
    catch (caught) {
      setJoinError(roomErrorMessage(caught)); codeInput.current?.focus();
      if (fromLink) setParams((current) => { const next = new URLSearchParams(current); next.delete(ROOM_LINK_PARAM); return next; }, { replace: true });
    }
    finally { setBusy(null); }
  }

  // Entrar por enlace: con conexión y sin sala propia; si el enlace es de la sala en la que ya estás, vuelve a ella.
  useEffect(() => {
    if (!linkCode || !connected || finishedDaily || linkHandled.current === linkCode) return;
    linkHandled.current = linkCode;
    if (currentRoom) { if (currentRoom.code === linkCode) navigate('/room', { replace: true }); return; }
    resetErrors(); setCode(linkCode);
    // `joinWith` no va en las dependencias: el enlace se atiende una sola vez por código.
    void joinWith(linkCode, true);
  }, [linkCode, connected, finishedDaily, currentRoom, navigate]);

  async function leave() {
    setBusy('leave'); setLeaveError('');
    try { await leaveRoom({ reportError: false }); }
    catch (caught) { setLeaveError(roomErrorMessage(caught)); }
    finally { setBusy(null); }
  }

  if (room) {
    const isDaily = Boolean(room.daily);
    return (
      <Screen width="narrow">
        <Panel variant="cream" aria-labelledby="sala-activa-title" className="w-full">
          <div className="flex flex-col items-center gap-4 px-2 pb-2 pt-3 text-center 2xl:gap-6 2xl:px-6 2xl:pb-5 2xl:pt-6">
            <span className={cx('grid h-16 w-16 place-items-center 2xl:h-20 2xl:w-20', shape.disc, tone.borderNavy, tone.bgYellow, tone.textNavy)}><Icon icon={isDaily ? CalendarDays : DoorOpen} size={32} className="2xl:h-10 2xl:w-10" /></span>
            <h1 id="sala-activa-title" className={cx('font-display text-26 font-extrabold sm:text-34 2xl:text-44', tone.textNavy)}>{isDaily ? 'Tienes un reto diario en curso' : 'Ya tienes una sala activa'}</h1>
            {/* La sala del reto es privada: no hay código que enseñar. */}
            {!isDaily && <p className={cx('flex flex-wrap items-baseline justify-center gap-x-2 text-15 font-bold 2xl:text-18', tone.textInk2)}>
              Código <strong className={cx('font-display text-26 tracking-[.3em] lg:text-34 2xl:text-44', tone.textInk)}>{room.code}</strong>
            </p>}
            <div className="grid w-full gap-3 sm:grid-cols-2 2xl:mt-2 2xl:gap-4">
              <Pill variant="yellow" icon={DoorOpen} block disabled={busy !== null} onClick={() => navigate('/room')}>{isDaily ? 'Volver al reto' : 'Volver a la sala'}</Pill>
              <Pill variant="cream" icon={LogOut} block loading={busy === 'leave'} disabled={busy !== null || !connected} onClick={() => { if (isDaily) setConfirmAbandon(true); else void leave(); }}>{isDaily ? 'Abandonar el reto' : 'Salir de la sala'}</Pill>
            </div>
            {leaveError && <div className="w-full"><StateBox kind="error" title={isDaily ? 'No se pudo abandonar el reto' : 'No se pudo salir de la sala'} text={leaveError} onCream /></div>}
          </div>
        </Panel>
        <ConfirmDialog open={confirmAbandon} title="¿Abandonar el reto?" onClose={() => setConfirmAbandon(false)}
          confirmLabel="Abandonar el reto" onConfirm={() => void leave()}>
          <p>{ABANDON_DAILY_TEXT}</p>
        </ConfirmDialog>
      </Screen>
    );
  }

  const off = busy !== null || !connected;
  return (
    <Screen width="wide">
      <ScreenHeader title="Entrar en partida" subtitle="Crea tu sala, entra en la de tu grupo con su código o juega el reto de hoy." centerOnMobile />
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel
            variant="cream"
            title={<PanelTitle icon={Crown}>Crear sala</PanelTitle>}
            aria-label="Crear sala"
            bodyClassName="flex flex-col"
            status={createError ? { kind: 'error', title: 'No se pudo crear la sala', text: createError, action: { label: 'Reintentar', onClick: () => void create() } } : null}
          >
            <div className="flex flex-1 flex-col gap-4 px-1 pb-1 pt-2 2xl:gap-5 2xl:px-3 2xl:pb-3 2xl:pt-4">
              <ul className={cx('flex flex-col gap-2 text-15 font-bold 2xl:gap-3 2xl:text-18', tone.textInk)}>
                <li className="flex items-center gap-2"><Icon icon={Gamepad2} size={18} className={cx('shrink-0', tone.textBlueD)} />Eliges el minijuego y sus ajustes</li>
                <li className="flex items-center gap-2"><Icon icon={KeyRound} size={18} className={cx('shrink-0', tone.textBlueD)} />Compartes un código de 6 caracteres</li>
                <li className="flex items-center gap-2"><Icon icon={Users} size={18} className={cx('shrink-0', tone.textBlueD)} />Tu grupo entra y empezáis a jugar</li>
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
          <DailyPanel guest={guest} overview={daily.overview} loadError={daily.error} playError={dailyError} busy={busy === 'daily'} disabled={off}
            now={daily.now} onPlay={() => void playDaily()} onReload={daily.reload} />
        </div>
    </Screen>
  );
}
