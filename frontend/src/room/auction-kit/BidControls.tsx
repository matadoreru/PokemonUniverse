import type { LucideIcon } from 'lucide-react';
import { Coins, Crown, Eye, Gavel, Hourglass, Lock, PackageCheck, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type Ref } from 'react';
import { ActionPlate, cx, Dialog, Field, Pill } from '../../ui';
import { useRefocusAfterReject } from '../focus-transition';
import { sendWithBusy } from '../room-command';
import { bindChoiceShortcuts } from '../social-kit';
import { bidDraftError, bidShortcutsLive, bidSteps, clampBid, parseBid, safeAmount, type BidBlock, type BidBlockReason } from './presentation';
import s from './BidControls.module.css';

const REASON_ICON: Record<BidBlockReason, LucideIcon> = { open: Gavel, watching: Eye, closed: Lock, leading: Crown, full: PackageCheck, noBudget: Coins, waiting: Hourglass, passed: SkipForward };
const REASON_TONE: Record<BidBlockReason, 'ok' | 'bad' | 'info' | 'warn'> = { open: 'warn', watching: 'info', closed: 'info', leading: 'ok', full: 'ok', noBudget: 'bad', waiting: 'info', passed: 'info' };

/** Confirmación antes de pasar (Bluff: «Quedarás fuera de esta ronda»): un `Dialog` del catálogo, nunca `window.confirm`. */
export interface PassConfirm {
  title: string;
  text: string;
  /** Texto del botón que confirma (por defecto, el de pasar). */
  confirmLabel?: string;
}

export interface BidControlsProps {
  /** Al título (`h2#bid-controls-title`, `tabIndex -1`) va el foco al cambiar de fase (`useFocusOnTransition`). */
  titleRef: Ref<HTMLHeadingElement>;
  /** Estado de la puja propia (`bidBlock(...)`): título, ayuda y qué se puede hacer. */
  block: BidBlock;
  /** Mínima y máximo que se puede pujar (Team Auction: las monedas; Bluff: `maxBid`). */
  min: number;
  max: number;
  /** Unidad («monedas» por defecto). */
  unit?: string;
  /** Época del envío (`bidEpoch(lote, eventos)`): el campo vuelve a la mínima y el foco vuelve a «Pujar» tras un rechazo. */
  epoch: number;
  /** Envía la puja. Debe rechazar si el servidor rechaza (`onAction` tal cual, sin `.catch`): el aviso global lo dice. */
  onBid(amount: number): Promise<void>;
  /** Sin él no hay «Pasar» (un motor que no lo admite). Igual que `onBid`: rechaza si el servidor rechaza. */
  onPass?: (() => Promise<void>) | undefined;
  /** Texto de «Pasar» («Pasar este Pokémon», «Pasar esta ronda»). */
  passLabel?: string;
  /** Pide confirmación antes de pasar. */
  confirmPass?: PassConfirm | undefined;
  /** Presupuesto propio a la derecha del título (Team Auction: las monedas); `null`/ausente: no se pinta. */
  budget?: number | null | undefined;
  /** Kicker de la placa («Tu puja»). */
  kicker?: string;
  /** Incremento «Todo» (el máximo). */
  allIn?: boolean;
  className?: string | undefined;
}

/**
 * Controles de la puja (pantalla de abajo, spec §2): una placa crema con el estado en texto (icono, kicker, título y
 * ayuda: «Tu turno», «Ya vas ganando», «Sin presupuesto», «Puja cerrada»…), el presupuesto propio y, debajo, los
 * incrementos (`Pill`s con atajos 1–4 que nunca se disparan escribiendo), el campo numérico, «Pujar N» y «Pasar».
 *
 * Sin poder pujar ni pasar (no es tu turno, vas ganando, has pasado, sin presupuesto, puja cerrada) no hay controles
 * grises: solo la placa con el mensaje en texto («Le toca a Ana. Tú vas ganando con 3») y el presupuesto, que sigue a la
 * vista (`data-idle`). Si el servidor deja pasar pero no subir (Bluff en la puja máxima), solo queda «Pasar»: sin
 * campo (su mínima sería imposible), sin incrementos ni «Pujar» grises. Quien observa solo ve la placa. Lo escrito se valida en texto bajo el campo (sin alerta: la única región viva es la de la
 * pantalla) y nunca envía `NaN`, negativos ni más del máximo. Tras un rechazo, el foco vuelve a «Pujar».
 * `data-testid`: `bid-controls`, `bid-submit`, `bid-pass`, `bid-step`.
 */
export function BidControls({ titleRef, block, min, max, unit = 'monedas', epoch, onBid, onPass, passLabel = 'Pasar', confirmPass, budget, kicker = 'Tu puja', allIn = true, className }: BidControlsProps) {
  const low = Math.max(1, safeAmount(min));
  const high = safeAmount(max);
  const [draft, setDraft] = useState(() => String(low));
  const [busy, setBusy] = useState<'bid' | 'pass' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const bidRef = useRef<HTMLButtonElement>(null);
  const steps = useMemo(() => bidSteps(low, high, { allIn }), [low, high, allIn]);

  // Lote, ronda o puja nueva: el campo vuelve a la mínima.
  useEffect(() => { setDraft(String(low)); setConfirming(false); }, [epoch, low]);
  useRefocusAfterReject(epoch, busy !== null, block.canRaise, bidRef);

  const raising = block.canRaise && busy === null;
  const shortcuts = bidShortcutsLive({ canRaise: block.canRaise, busy: busy !== null, confirming });
  useEffect(() => {
    if (!shortcuts || steps.length === 0) return undefined;
    const values = new Map(steps.map((step) => [step.key, step.value]));
    return bindChoiceShortcuts(window, steps.map((step) => step.key), (key) => setDraft(String(values.get(key) ?? low)));
  }, [shortcuts, steps, low]);

  const amount = parseBid(draft);
  const draftError = block.canRaise ? bidDraftError(draft, low, high, unit) : null;
  const canSend = raising && draftError === null && amount !== null;

  async function send(kind: 'bid' | 'pass', request: () => Promise<void>) {
    if (busy) return;
    // El fallo ya sale en el aviso global de la sala; el foco vuelve a «Pujar».
    await sendWithBusy((on) => setBusy(on ? kind : null), request);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend || amount === null) return;
    void send('bid', () => onBid(clampBid(amount, low, high)));
  }
  function pass() {
    if (!onPass || !block.canPass || busy) return;
    if (confirmPass) { setConfirming(true); return; }
    void send('pass', onPass);
  }

  const participating = block.reason !== 'watching';
  const idle = participating && !block.canRaise && !block.canPass;
  const tone = REASON_TONE[block.reason];
  const budgetPlate = budget != null && <>
    <span className={s.budgetLabel}>Tu presupuesto</span>
    <span className={s.budgetValue}><strong>{safeAmount(budget)}</strong> <small>{unit === 'monedas' && safeAmount(budget) === 1 ? 'moneda' : unit}</small></span>
  </>;
  return <ActionPlate titleId="bid-controls-title" titleRef={titleRef} icon={REASON_ICON[block.reason]} tone={tone} kicker={kicker} title={block.title} text={block.text} aside={budgetPlate}
    className={className} plateClassName={s.plate} iconClassName={s.icon} textClassName={s.text} helpClassName={idle ? s.message : s.help} asideClassName={s.budget}
    rowAttrs={{ 'data-testid': 'bid-controls', 'data-reason': block.reason, 'data-idle': idle || undefined }} asideAttrs={{ 'data-testid': 'bid-budget' }}>
    {participating && !idle && <form className={s.controls} onSubmit={submit} aria-label="Controles de la puja">
      {block.canRaise && steps.length > 0 && <div className={s.steps} role="group" aria-label="Incrementos (atajos 1 a 4)">
        {steps.map((step) => <Pill key={step.key} size="small" variant="blue" badge={step.shortcut} aria-keyshortcuts={step.shortcut} aria-pressed={amount === step.value}
          disabled={!raising} data-testid="bid-step" onClick={() => setDraft(String(step.value))}>{`${step.label}: ${step.value}`}</Pill>)}
      </div>}
      <div className={s.send}>
        {block.canRaise && <>
          <Field label={`Tu puja (${unit})`} type="number" inputMode="numeric" min={low} max={Math.max(low, high)} step={1} value={draft} className={cx(s.field)}
            disabled={!raising} aria-invalid={draftError ? true : undefined} {...(draftError ? { hint: draftError } : {})}
            onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (block.canRaise) setDraft(String(clampBid(draft, low, high))); }} />
          <Pill ref={bidRef} type="submit" variant="yellow" icon={Gavel} loading={busy === 'bid'} disabled={!canSend} data-testid="bid-submit" className={cx(s.submit)}>
            {amount !== null && draftError === null ? `Pujar ${amount}` : 'Pujar'}
          </Pill>
        </>}
        {onPass && <Pill variant="blue" icon={SkipForward} loading={busy === 'pass'} disabled={!block.canPass || busy !== null} data-testid="bid-pass" onClick={pass}>{passLabel}</Pill>}
      </div>
    </form>}
    {confirmPass && <Dialog open={confirming} title={confirmPass.title} onClose={() => setConfirming(false)}
      actions={[
        { label: confirmPass.confirmLabel ?? passLabel, onClick: () => { setConfirming(false); if (onPass) void send('pass', onPass); } },
        { label: 'Seguir pujando', variant: 'blue', autoFocus: true, onClick: () => setConfirming(false) },
      ]}>
      <p>{confirmPass.text}</p>
    </Dialog>}
  </ActionPlate>;
}
