import { Volume2, VolumeX } from 'lucide-react';
import { audio, useAudioSettings } from '../audio';

export function SoundToggleButton({ enabled, onToggle }: { enabled: boolean; onToggle(): void }) {
  const label = enabled ? 'Silenciar sonido' : 'Activar sonido';
  return <button type="button" className="icon-button" onClick={onToggle} aria-pressed={enabled} aria-label={label} title={label}>
    {enabled ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
  </button>;
}

/** Provisional: la Tarea 4 lo sustituye por el panel de ajustes. El clic que activa el sonido crea el `AudioContext`. */
export function SoundToggle() {
  const enabled = !useAudioSettings().muted;
  return <SoundToggleButton enabled={enabled} onToggle={() => audio.update({ muted: enabled })} />;
}
