import { Volume2, VolumeX } from 'lucide-react';
import { useSfxEnabled } from '../lib/sfx';

export function SoundToggleButton({ enabled, onToggle }: { enabled: boolean; onToggle(): void }) {
  const label = enabled ? 'Silenciar sonido' : 'Activar sonido';
  return <button type="button" className="icon-button" onClick={onToggle} aria-pressed={enabled} aria-label={label} title={label}>
    {enabled ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
  </button>;
}

/** Botón de la cabecera: el clic que activa el sonido es el que crea el `AudioContext`. */
export function SoundToggle() {
  const [enabled, setEnabled] = useSfxEnabled();
  return <SoundToggleButton enabled={enabled} onToggle={() => setEnabled(!enabled)} />;
}
