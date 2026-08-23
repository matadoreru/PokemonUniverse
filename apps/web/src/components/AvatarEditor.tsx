import { AVATAR_PRESETS, type AuthUser, type AvatarRef } from '@pokemon-universe/shared';
import { Camera, Check, ImagePlus, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api } from '../lib/api';
import { Avatar } from './Avatar';

const MAX_CLIENT_BYTES = 5 * 1024 * 1024;

export function AvatarEditor({ name, avatar, onSaved }: { name: string; avatar: AvatarRef; onSaved(user: AuthUser): void }) {
  const [open, setOpen] = useState(false); const [source, setSource] = useState<string | null>(null); const [zoom, setZoom] = useState(1); const [offsetX, setOffsetX] = useState(0); const [offsetY, setOffsetY] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Selecciona una imagen JPEG, PNG o WEBP.'); return; }
    if (file.size > MAX_CLIENT_BYTES) { setError('La imagen supera el límite de 5 MB.'); return; }
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file)); setZoom(1); setOffsetX(0); setOffsetY(0);
  }

  async function selectPreset(presetId: string) {
    setBusy(true); setError('');
    try { const body = await api<{ user: AuthUser }>('/auth/profile/avatar/preset', { method: 'PUT', body: JSON.stringify({ presetId }) }); onSaved(body.user); setSource(null); setOpen(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar el avatar.'); }
    finally { setBusy(false); }
  }

  async function removeAvatar() {
    setBusy(true); setError('');
    try { const body = await api<{ user: AuthUser }>('/auth/profile/avatar', { method: 'DELETE' }); onSaved(body.user); setSource(null); setOpen(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo eliminar el avatar.'); }
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
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo subir el avatar.'); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="group relative rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-aqua/40" aria-label="Cambiar avatar"><Avatar name={name} avatar={avatar} size="xl" /><span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-berry text-white shadow"><Camera size={15} /></span></button>
    {open && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/75 p-4" role="dialog" aria-modal="true" aria-labelledby="avatar-title"><div className="card my-auto w-full max-w-2xl !p-5 sm:!p-7"><div className="flex items-center justify-between"><div><span className="label">Foto de perfil</span><h2 id="avatar-title" className="font-display text-3xl">Elige tu avatar</h2></div><button className="grid h-11 w-11 place-items-center rounded-xl hover:bg-ink/5" onClick={() => setOpen(false)} aria-label="Cerrar"><X /></button></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{AVATAR_PRESETS.map((preset) => <button key={preset.id} disabled={busy} onClick={() => void selectPreset(preset.id)} className={`relative grid min-h-28 place-items-center rounded-2xl border-2 p-3 transition hover:-translate-y-0.5 ${avatar.type === 'PRESET' && avatar.value === preset.id ? 'border-berry bg-berry/10' : 'border-ink/10 hover:border-aqua'}`}><Avatar name={preset.label} avatar={{ type: 'PRESET', value: preset.id }} size="lg" /><span className="mt-2 text-xs font-extrabold">{preset.label.replace('Entrenador ', '').replace('Entrenadora ', '')}</span>{avatar.type === 'PRESET' && avatar.value === preset.id && <Check className="absolute right-2 top-2 text-berry" size={17} />}</button>)}</div>
      <div className="my-6 border-t border-ink/10" />
      {!source ? <label className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-aqua/40 bg-aqua/5 font-extrabold text-aqua hover:bg-aqua/10"><ImagePlus /> Subir mi propia imagen<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseFile} /></label> : <div className="grid gap-5 sm:grid-cols-[256px_1fr]"><div className="mx-auto h-64 w-64 overflow-hidden rounded-full border-4 border-aqua bg-night"><img ref={imageRef} src={source} alt="Previsualización del recorte" className="h-full w-full object-cover" style={{ transform: `translate(${offsetX * .35}%, ${offsetY * .35}%) scale(${zoom})` }} /></div><div className="space-y-4"><label className="block"><span className="label">Zoom · {zoom.toFixed(1)}x</span><input className="w-full accent-berry" type="range" min="1" max="3" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><label className="block"><span className="label">Mover horizontalmente</span><input className="w-full accent-aqua" type="range" min="-100" max="100" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} /></label><label className="block"><span className="label">Mover verticalmente</span><input className="w-full accent-electric" type="range" min="-100" max="100" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} /></label><button className="btn-primary w-full" disabled={busy} onClick={() => void uploadCrop()}><Check /> {busy ? 'Procesando…' : 'Recortar y guardar'}</button><button className="btn-ghost w-full" disabled={busy} onClick={() => setSource(null)}><RotateCcw /> Elegir otra</button></div></div>}
      {avatar.type === 'CUSTOM' && !source && <button className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl font-extrabold text-berry hover:bg-berry/10" disabled={busy} onClick={() => void removeAvatar()}><Trash2 size={17} /> Eliminar foto personalizada</button>}
      {error && <p className="mt-4 rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry" role="alert">{error}</p>}<p className="mt-4 text-center text-xs font-bold text-ink/40">JPEG, PNG o WEBP · máximo 5 MB · resultado cuadrado de 256px</p></div></div>}
  </>;
}
