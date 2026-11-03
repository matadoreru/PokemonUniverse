import { AVATAR_PRESETS, type AuthUser, type AvatarRef } from '@pokemon-universe/shared/public';
import { Camera, Check, ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api } from '../lib/api';
import { authErrorMessage } from '../auth/authErrors';
import { Card, Dialog, Pill, Slider } from '../ui';
import { Avatar } from './Avatar';

const MAX_CLIENT_BYTES = 5 * 1024 * 1024;

export function AvatarEditor({ name, avatar, onSaved }: { name: string; avatar: AvatarRef; onSaved(user: AuthUser): void }) {
  const [open, setOpen] = useState(false); const [source, setSource] = useState<string | null>(null); const [zoom, setZoom] = useState(1); const [offsetX, setOffsetX] = useState(0); const [offsetY, setOffsetY] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const imageRef = useRef<HTMLImageElement>(null); const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Selecciona una imagen JPEG, PNG o WEBP.'); return; }
    if (file.size > MAX_CLIENT_BYTES) { setError('La imagen supera el límite de 5 MB.'); return; }
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file)); setZoom(1); setOffsetX(0); setOffsetY(0);
  }

  async function selectPreset(presetId: string) {
    setBusy(true); setError('');
    try { const body = await api<{ user: AuthUser }>('/auth/profile/avatar/preset', { method: 'PUT', body: JSON.stringify({ presetId }) }); onSaved(body.user); setSource(null); setOpen(false); }
    catch (caught) { setError(authErrorMessage(caught)); }
    finally { setBusy(false); }
  }

  async function removeAvatar() {
    setBusy(true); setError('');
    try { const body = await api<{ user: AuthUser }>('/auth/profile/avatar', { method: 'DELETE' }); onSaved(body.user); setSource(null); setOpen(false); }
    catch (caught) { setError(authErrorMessage(caught)); }
    finally { setBusy(false); }
  }

  async function uploadCrop() {
    const image = imageRef.current; if (!image?.naturalWidth || !image.naturalHeight) return;
    setBusy(true); setError('');
    try {
      const size = 512; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Tu navegador no permite recortar esta imagen.');
      const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight); const scale = baseScale * zoom;
      const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
      const maxX = Math.max(0, (width - size) / 2); const maxY = Math.max(0, (height - size) / 2);
      const x = (size - width) / 2 + offsetX / 100 * maxX; const y = (size - height) / 2 + offsetY / 100 * maxY;
      context.drawImage(image, x, y, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
      if (!blob) throw new Error('No se pudo procesar la imagen.');
      const body = await api<{ user: AuthUser }>('/auth/profile/avatar/custom', { method: 'PUT', headers: { 'Content-Type': blob.type || 'image/webp' }, body: blob });
      onSaved(body.user); if (source) URL.revokeObjectURL(source); setSource(null); setOpen(false);
    } catch (caught) { setError(authErrorMessage(caught)); }
    finally { setBusy(false); }
  }

  const current = avatar.type === 'PRESET' ? avatar.value : null;
  return <>
    <span className="relative inline-flex shrink-0">
      <Avatar name={name} avatar={avatar} size="xxl" className="border-[3px] border-[color:var(--navy)]" />
      <span className="absolute -bottom-1 -right-1" data-layer>
        <Pill size="round" variant="yellow" icon={Camera} aria-label="Cambiar avatar" title="Cambiar avatar" onClick={() => setOpen(true)} />
      </span>
    </span>
    <Dialog open={open} title="Elige tu avatar" onClose={() => setOpen(false)} width={672} actions={[{ label: 'Cerrar', variant: 'blue', onClick: () => undefined, autoFocus: true }]}>
      {/* Mientras se recorta una imagen propia, solo el recorte: los predefinidos vuelven con «Elegir otra». */}
      {!source && <>
        <h3 className="font-display text-15 font-extrabold text-[color:var(--ink)]">Avatares del universo</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={busy || undefined}>
          {AVATAR_PRESETS.map((preset) => <Card key={preset.id} sprite={preset.asset} photo name={preset.label.replace(/^Entrenadora? /, '')} state={current === preset.id ? 'selected' : 'idle'} onSelect={() => { if (!busy && current !== preset.id) void selectPreset(preset.id); }} />)}
        </div>
        <div className="my-5 border-t-[3px] border-dashed border-[color:var(--ink-2)] opacity-40" aria-hidden="true" />
      </>}
      <h3 className="font-display text-15 font-extrabold text-[color:var(--ink)]">Tu propia imagen</h3>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={chooseFile} />
      {!source
        ? <div className="mt-3 flex flex-wrap gap-3">
            <Pill variant="cream" icon={ImagePlus} disabled={busy} onClick={() => fileInput.current?.click()}>Subir mi propia imagen</Pill>
            {avatar.type === 'CUSTOM' && <Pill variant="danger" icon={Trash2} loading={busy} onClick={() => void removeAvatar()}>Eliminar foto personalizada</Pill>}
          </div>
        : <div className="mt-3 grid gap-5 sm:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="mx-auto h-56 w-56 overflow-hidden rounded-full border-[3px] border-[color:var(--navy)] bg-[var(--navy)]"><img ref={imageRef} src={source} alt="Previsualización del recorte" className="h-full w-full object-cover" style={{ transform: `translate(${offsetX * .35}%, ${offsetY * .35}%) scale(${zoom})` }} /></div>
            <div className="flex min-w-0 flex-col gap-3">
              <Slider label="Zoom" value={zoom} onChange={setZoom} min={1} max={3} step={0.1} valueText={(v) => `${v.toFixed(1)}×`} disabled={busy} />
              <Slider label="Mover horizontalmente" value={offsetX} onChange={setOffsetX} min={-100} max={100} step={1} disabled={busy} />
              <Slider label="Mover verticalmente" value={offsetY} onChange={setOffsetY} min={-100} max={100} step={1} disabled={busy} />
              <div className="mt-1 flex flex-wrap gap-3">
                <Pill variant="yellow" icon={Check} loading={busy} onClick={() => void uploadCrop()}>Recortar y guardar</Pill>
                <Pill variant="cream" icon={RotateCcw} disabled={busy} onClick={() => setSource(null)}>Elegir otra</Pill>
              </div>
            </div>
          </div>}
      {error && <p className="mt-4 text-15 font-bold text-[color:var(--red-d)]" role="alert">{error}</p>}
      <p className="mt-4 text-13 font-semibold text-[color:var(--ink-2)]">JPEG, PNG o WEBP · máximo 5 MB · se guarda como un cuadrado de 256 px.</p>
    </Dialog>
  </>;
}
