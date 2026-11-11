import { audio, useAudioSettings } from '../audio';
import type { AudioSettings, Step } from '../audio';
import { VOLUME_STEP } from '../audio/settings';
import { display, useDisplayPreferences, type DisplayPreferences } from '../preferences/display';
import type { MotionPreference, TextPreference } from '../preferences/preferences';
import { Dialog, Segmented, Slider, Toggle } from '../ui';

type VolumeKey = 'master' | 'music' | 'sfx' | 'ui';

const GROUPS: { key: VolumeKey; label: string }[] = [
  { key: 'master', label: 'Volumen general' },
  { key: 'music', label: 'Música' },
  { key: 'sfx', label: 'Efectos' },
  { key: 'ui', label: 'Interfaz' },
];

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'reduce', label: 'Reducido' },
  { value: 'full', label: 'Completo' },
];

const TEXT_OPTIONS: { value: TextPreference; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grande' },
  { value: 'xlarge', label: 'Muy grande' },
];

/** Cambio de ajustes para un deslizador de volumen. */
export function audioPatchFor(key: VolumeKey, step: Step): Partial<AudioSettings> {
  return { [key]: step };
}

export interface AudioSettingsPanelProps {
  settings: AudioSettings;
  onPatch(patch: Partial<AudioSettings>): void;
}

/** Sección «Sonido», sin estado: lo que se ve depende solo de los ajustes. */
export function AudioSettingsPanel({ settings, onPatch }: AudioSettingsPanelProps) {
  const muted = settings.muted;
  return (
    <div className="grid gap-3">
      <Toggle label="Sonido" checked={!muted} onChange={(on) => onPatch({ muted: !on })} />
      {GROUPS.map((g) => (
        <Slider
          key={g.key}
          label={g.label}
          value={settings[g.key]}
          min={0}
          max={100}
          step={VOLUME_STEP}
          valueText={(v) => `${v} %`}
          disabled={muted}
          onChange={(v) => onPatch(audioPatchFor(g.key, v))}
        />
      ))}
    </div>
  );
}

export interface DisplaySettingsPanelProps {
  preferences: DisplayPreferences;
  onPatch(patch: Partial<DisplayPreferences>): void;
}

/** Secciones «Movimiento» y «Texto», sin estado. */
export function DisplaySettingsPanel({ preferences, onPatch }: DisplaySettingsPanelProps) {
  return (
    <div className="grid gap-4">
      <Segmented block showLabel label="Movimiento" hint="«Sistema» sigue el ajuste de tu dispositivo." value={preferences.motion} options={MOTION_OPTIONS} onChange={(motion) => onPatch({ motion })} />
      <Segmented block showLabel label="Texto" value={preferences.text} options={TEXT_OPTIONS} onChange={(text) => onPatch({ text })} />
    </div>
  );
}

export interface SettingsPanelProps {
  audio: AudioSettings;
  display: DisplayPreferences;
  onAudio(patch: Partial<AudioSettings>): void;
  onDisplay(patch: Partial<DisplayPreferences>): void;
}

/** Contenido del diálogo «Ajustes»: Sonido, Movimiento y Texto. */
export function SettingsPanel({ audio: audioSettings, display: displayPreferences, onAudio, onDisplay }: SettingsPanelProps) {
  return (
    <div className="grid gap-5">
      <AudioSettingsPanel settings={audioSettings} onPatch={onAudio} />
      <DisplaySettingsPanel preferences={displayPreferences} onPatch={onDisplay} />
    </div>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const settings = useAudioSettings();
  const preferences = useDisplayPreferences();
  // «Cerrar» no necesita hacer nada: `Dialog` se cierra (llama a `onClose`) después de ejecutar cualquier acción.
  return (
    <Dialog open={open} title="Ajustes" onClose={onClose} actions={[{ label: 'Cerrar', variant: 'ghost', onClick: () => undefined }]}>
      <SettingsPanel
        audio={settings}
        display={preferences}
        onAudio={(patch) => {
          // Activar el sonido desde aquí es un clic: crea el AudioContext antes de aplicar el cambio.
          if (patch.muted === false) audio.unlock();
          audio.update(patch);
        }}
        onDisplay={(patch) => display.update(patch)}
      />
    </Dialog>
  );
}
