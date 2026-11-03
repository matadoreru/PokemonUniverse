/**
 * Galería del catálogo Arcade DS (solo desarrollo, `/dev/ui`; spec §4): cada componente de `src/ui` en todos sus
 * estados, con datos ficticios fijos y sin red. Cada sección lleva `data-gallery-section` y cada estado va en un
 * `<figure data-gallery="<componente>-<estado>">` que el E2E captura uno a uno. Con `?static` en la URL se añade la
 * clase `static` al `body` (sin animaciones ni transiciones).
 */
import { Bell, Heart, Settings, Star, Trophy, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AudioSettingsPanel } from '../../components/AudioSettingsDialog';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';
import type { PokemonType } from '../../styles/tokens';
import { typeColors } from '../../styles/tokens';
import { Badge, Chip, TypeBadge } from '../Badge';
import { Bar } from '../Bar';
import { Card } from '../Card';
import type { CardState } from '../Card';
import { Cutin } from '../Cutin';
import type { CutinTone } from '../Cutin';
import type { ForcedState } from '../cx';
import { Dialog } from '../Dialog';
import { Field, SelectField, TextArea } from '../Field';
import { HudPlate } from '../HudPlate';
import { Icon } from '../Icon';
import { Panel } from '../Panel';
import { Pill } from '../Pill';
import { Row } from '../Row';
import { ScorePop } from '../ScorePop';
import { ScreenSplit } from '../ScreenSplit';
import { Segmented } from '../Segmented';
import { Slider } from '../Slider';
import { StateBox } from '../StateBox';
import { TabPanel, Tabs } from '../Tabs';
import { Timer } from '../Timer';
import { ToastStack, useToasts } from '../Toast';
import { Toggle } from '../Toggle';
import { cx } from '../cx';
import s from './Gallery.module.css';

/** Instante fijo de los temporizadores: la captura no depende del reloj. */
const NOW = 1_700_000_000_000;
const TYPES = Object.keys(typeColors) as PokemonType[];
const noop = () => undefined;

/** Estados de un interactivo: normal y los tres forzados. */
const STATES: { key: string; label: string; forced?: ForcedState }[] = [
  { key: 'normal', label: 'normal' },
  { key: 'hover', label: 'hover', forced: 'hover' },
  { key: 'focus', label: 'foco', forced: 'focus' },
  { key: 'active', label: 'pulsado', forced: 'active' },
];

/** `forced` solo cuando hay estado (con `exactOptionalPropertyTypes` no vale pasar `undefined`). */
function force(f?: ForcedState): { forced?: ForcedState } {
  return f ? { forced: f } : {};
}

function Fig({ id, caption, children, wide, cream }: { id: string; caption: string; children: ReactNode; wide?: boolean; cream?: boolean }) {
  return (
    <figure className={cx(s.fig, wide && s.wide)} data-gallery={id}>
      <figcaption className={s.cap}>{caption}</figcaption>
      <div className={cx(s.box, cream && s.cream)}>{children}</div>
    </figure>
  );
}

function Section({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return (
    <section className={s.section} data-gallery-section={name} aria-labelledby={`gallery-${name}`}>
      <h2 id={`gallery-${name}`} className={s.sectionTitle}>
        {title}
      </h2>
      <div className={s.grid}>{children}</div>
    </section>
  );
}

const PILL_VARIANTS = [
  { v: 'blue', label: 'Azul' },
  { v: 'danger', label: 'Peligro' },
  { v: 'ghost', label: 'Fantasma' },
  { v: 'cream', label: 'Crema' },
] as const;

function PillSection() {
  return (
    <Section name="pill" title="Pill">
      {PILL_VARIANTS.flatMap(({ v, label }) => [
        ...STATES.map((st) => (
          <Fig key={`${v}-${st.key}`} id={`pill-${v}-${st.key}`} caption={`${label} · ${st.label}`}>
            <Pill variant={v} {...force(st.forced)}>
              {label}
            </Pill>
          </Fig>
        )),
        <Fig key={`${v}-disabled`} id={`pill-${v}-disabled`} caption={`${label} · deshabilitada`}>
          <Pill variant={v} disabled>
            {label}
          </Pill>
        </Fig>,
        <Fig key={`${v}-loading`} id={`pill-${v}-loading`} caption={`${label} · cargando`}>
          <Pill variant={v} loading>
            {label}
          </Pill>
        </Fig>,
      ])}
      {STATES.map((st) => (
        <Fig key={`yellow-${st.key}`} id={`pill-yellow-${st.key}`} caption={`Amarilla · ${st.label}`}>
          <Pill variant="yellow" {...force(st.forced)}>
            Amarilla
          </Pill>
        </Fig>
      ))}
      <Fig id="pill-yellow-disabled" caption="Amarilla · deshabilitada">
        <Pill variant="yellow" disabled>
          Amarilla
        </Pill>
      </Fig>
      <Fig id="pill-yellow-loading" caption="Amarilla · cargando">
        <Pill variant="yellow" loading>
          Amarilla
        </Pill>
      </Fig>
      <Fig id="pill-yellow-main" caption="Amarilla · principal">
        <Pill variant="yellow" size="main">
          Empezar
        </Pill>
      </Fig>
      {STATES.map((st) => (
        <Fig key={`red-${st.key}`} id={`pill-red-${st.key}`} caption={`Roja principal · ${st.label}`}>
          <Pill variant="red" size="main" {...force(st.forced)}>
            ¡Jugar!
          </Pill>
        </Fig>
      ))}
      <Fig id="pill-red-disabled" caption="Roja principal · deshabilitada">
        <Pill variant="red" size="main" disabled>
          ¡Jugar!
        </Pill>
      </Fig>
      <Fig id="pill-red-loading" caption="Roja principal · cargando">
        <Pill variant="red" size="main" loading>
          ¡Jugar!
        </Pill>
      </Fig>
      <Fig id="pill-small" caption="Pequeña">
        <Pill size="small">Pequeña</Pill>
      </Fig>
      <Fig id="pill-icon" caption="Con icono">
        <Pill icon={Settings}>Ajustes</Pill>
      </Fig>
      <Fig id="pill-round" caption="Redonda (solo icono)">
        <Pill size="round" icon={Bell} aria-label="Avisos" />
      </Fig>
      <Fig id="pill-badge" caption="Con atajo">
        <Pill variant="cream" badge="1">
          Opción A
        </Pill>
      </Fig>
      <Fig id="pill-block" caption="A todo el ancho" wide>
        <Pill variant="yellow" block>
          Confirmar
        </Pill>
      </Fig>
    </Section>
  );
}

function PanelSection() {
  return (
    <Section name="panel" title="Panel">
      <Fig id="panel-blue" caption="Azul" wide>
        <Panel title="Sala PIKA42" right={<Badge>3/8</Badge>}>
          <p className={s.text}>Panel azul con rayas y cabecera.</p>
        </Panel>
      </Fig>
      <Fig id="panel-cream" caption="Crema" wide>
        <Panel title="Ajustes" variant="cream">
          <p className={s.textInk}>Panel crema para formularios.</p>
        </Panel>
      </Fig>
      <Fig id="panel-dark" caption="Oscuro" wide>
        <Panel title="Marcador" variant="dark">
          <p className={s.text}>Panel azul noche.</p>
        </Panel>
      </Fig>
      <Fig id="panel-empty" caption="Vacío" wide>
        <Panel title="Historial" status={{ kind: 'empty', title: 'Sin partidas', text: 'Aún no has jugado ninguna partida.' }} />
      </Fig>
      <Fig id="panel-loading" caption="Cargando" wide>
        <Panel title="Historial" status={{ kind: 'loading', title: 'Cargando historial' }} />
      </Fig>
      <Fig id="panel-error" caption="Error" wide>
        <Panel title="Historial" status={{ kind: 'error', title: 'No se pudo cargar', text: 'Comprueba tu conexión.', action: { label: 'Reintentar', onClick: noop } }} />
      </Fig>
      <Fig id="panel-empty-cream" caption="Crema · vacío" wide>
        <Panel title="Ajustes" variant="cream" status={{ kind: 'empty', title: 'Sin ajustes', text: 'Este juego no tiene opciones.' }} />
      </Fig>
      <Fig id="panel-error-cream" caption="Crema · error" wide>
        <Panel title="Ajustes" variant="cream" status={{ kind: 'error', title: 'No se pudo guardar', text: 'Comprueba tu conexión.', action: { label: 'Reintentar', onClick: noop } }} />
      </Fig>
      <Fig id="panel-empty-dark" caption="Oscuro · vacío" wide>
        <Panel title="Marcador" variant="dark" status={{ kind: 'empty', title: 'Sin puntos', text: 'Nadie ha puntuado todavía.' }} />
      </Fig>
      <Fig id="panel-error-dark" caption="Oscuro · error" wide>
        <Panel title="Marcador" variant="dark" status={{ kind: 'error', title: 'No se pudo cargar', text: 'Comprueba tu conexión.', action: { label: 'Reintentar', onClick: noop } }} />
      </Fig>
    </Section>
  );
}

function StateBoxSection() {
  return (
    <Section name="statebox" title="StateBox">
      <Fig id="statebox-empty" caption="Vacío sobre crema" cream>
        <StateBox kind="empty" title="Nada por aquí" text="Crea una sala para empezar." onCream />
      </Fig>
      <Fig id="statebox-loading" caption="Cargando sobre crema" cream>
        <StateBox kind="loading" title="Cargando" onCream />
      </Fig>
      <Fig id="statebox-error" caption="Error sobre crema" cream>
        <StateBox kind="error" title="Algo falló" text="Inténtalo de nuevo." action={{ label: 'Reintentar', onClick: noop }} onCream />
      </Fig>
    </Section>
  );
}

function IconSection() {
  return (
    <Section name="icon" title="Icon">
      {([18, 22, 24, 32] as const).map((size) => (
        <Fig key={size} id={`icon-${size}`} caption={`${size} px`}>
          <span className={s.iconRow}>
            <Icon icon={Star} size={size} />
            <Icon icon={Trophy} size={size} />
            <Icon icon={Heart} size={size} label="Favorito" />
          </span>
        </Fig>
      ))}
    </Section>
  );
}

type TabKey = 'sala' | 'juego' | 'modo';
const TAB_ITEMS = [
  { key: 'sala' as const, label: 'Sala' },
  { key: 'juego' as const, label: 'Minijuego', badge: '2' },
  { key: 'modo' as const, label: 'Modo', disabled: true },
];

function TabsDemo({ idBase, forced }: { idBase: string; forced?: ForcedState }) {
  const [active, setActive] = useState<TabKey>('sala');
  return (
    <div className={s.stack}>
      <Tabs items={TAB_ITEMS} active={active} onChange={setActive} label="Secciones de la sala" idBase={idBase} {...force(forced)} {...(forced ? { forcedKey: 'juego' as const } : {})} />
      <TabPanel idBase={idBase} tabKey={active}>
        <p className={s.textInk}>Contenido de «{TAB_ITEMS.find((t) => t.key === active)?.label}».</p>
      </TabPanel>
    </div>
  );
}

function TabsSection() {
  return (
    <Section name="tabs" title="Tabs">
      {STATES.map((st) => (
        <Fig key={st.key} id={`tabs-${st.key}`} caption={st.forced ? `Pestaña «Minijuego» · ${st.label}` : 'Normal (con una deshabilitada)'} wide>
          <TabsDemo idBase={`gallery-tabs-${st.key}`} {...force(st.forced)} />
        </Fig>
      ))}
    </Section>
  );
}

function SegmentedDemo({ forced, disabledOption }: { forced?: ForcedState; disabledOption?: boolean }) {
  const [value, setValue] = useState(60);
  const options = [
    { value: 30, label: '30 s' },
    { value: 60, label: '60 s' },
    { value: 90, label: '90 s', disabled: Boolean(disabledOption) },
  ];
  return <Segmented value={value} options={options} onChange={setValue} label="Tiempo por ronda" {...force(forced)} />;
}

function SegmentedSection() {
  return (
    <Section name="segmented" title="Segmented">
      {STATES.map((st) => (
        <Fig key={st.key} id={`segmented-${st.key}`} caption={`Activa · ${st.label}`}>
          <SegmentedDemo {...force(st.forced)} />
        </Fig>
      ))}
      <Fig id="segmented-disabled" caption="Con una opción deshabilitada">
        <SegmentedDemo disabledOption />
      </Fig>
    </Section>
  );
}

function SelectDemo({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState('kanto');
  const options = [
    { value: 'kanto', label: 'Kanto' },
    { value: 'johto', label: 'Johto' },
    { value: 'hoenn', label: 'Hoenn' },
  ];
  return <SelectField label="Región" value={value} options={options} onChange={setValue} disabled={Boolean(disabled)} />;
}

function TextAreaDemo({ error }: { error?: string }) {
  const [value, setValue] = useState('Me encanta el modo Bingo.');
  return <TextArea label="Comentario" value={value} onChange={setValue} maxLength={120} rows={3} {...(error ? { error } : {})} />;
}

function FieldSection() {
  return (
    <Section name="field" title="Field, SelectField y TextArea">
      <Fig id="field-normal" caption="Texto · normal" cream>
        <Field label="Nombre de entrenador" defaultValue="Ash" />
      </Fig>
      <Fig id="field-hint" caption="Texto · con ayuda" cream>
        <Field label="Código de sala" placeholder="PIKA42" hint="Seis letras o números." />
      </Fig>
      <Fig id="field-focus" caption="Texto · foco" cream>
        <Field label="Nombre de entrenador" defaultValue="Misty" forced="focus" />
      </Fig>
      <Fig id="field-error" caption="Texto · con error" cream>
        <Field label="Nombre de entrenador" defaultValue="A" error="Escribe al menos 3 letras." />
      </Fig>
      <Fig id="field-disabled" caption="Texto · deshabilitado" cream>
        <Field label="Nombre de entrenador" defaultValue="Brock" disabled />
      </Fig>
      <Fig id="field-select" caption="Lista · normal" cream>
        <SelectDemo />
      </Fig>
      <Fig id="field-select-disabled" caption="Lista · deshabilitada" cream>
        <SelectDemo disabled />
      </Fig>
      <Fig id="field-textarea" caption="Área de texto con contador" cream>
        <TextAreaDemo />
      </Fig>
      <Fig id="field-textarea-error" caption="Área de texto · con error" cream>
        <TextAreaDemo error="El comentario no puede estar vacío." />
      </Fig>
    </Section>
  );
}

function SliderDemo({ forced, disabled }: { forced?: ForcedState; disabled?: boolean }) {
  const [value, setValue] = useState(70);
  return <Slider label="Volumen" value={value} onChange={setValue} min={0} max={100} step={5} valueText={(v) => `${v} %`} disabled={Boolean(disabled)} {...force(forced)} />;
}

function SliderSection() {
  return (
    <Section name="slider" title="Slider">
      {STATES.map((st) => (
        <Fig key={st.key} id={`slider-${st.key}`} caption={st.label}>
          <SliderDemo {...force(st.forced)} />
        </Fig>
      ))}
      <Fig id="slider-disabled" caption="deshabilitado">
        <SliderDemo disabled />
      </Fig>
      <Fig id="slider-cream" caption="Sobre crema" cream>
        <SliderDemo />
      </Fig>
      <Fig id="slider-cream-focus" caption="Sobre crema · foco" cream>
        <SliderDemo forced="focus" />
      </Fig>
    </Section>
  );
}

function ToggleDemo({ initial, forced, disabled, hint }: { initial: boolean; forced?: ForcedState; disabled?: boolean; hint?: string }) {
  const [checked, setChecked] = useState(initial);
  return <Toggle label="Música" checked={checked} onChange={setChecked} disabled={Boolean(disabled)} {...force(forced)} {...(hint ? { hint } : {})} />;
}

function ToggleSection() {
  return (
    <Section name="toggle" title="Toggle">
      <Fig id="toggle-off" caption="Apagado">
        <ToggleDemo initial={false} />
      </Fig>
      <Fig id="toggle-on" caption="Encendido con ayuda">
        <ToggleDemo initial hint="Suena en el lobby." />
      </Fig>
      {STATES.slice(1).map((st) => (
        <Fig key={st.key} id={`toggle-${st.key}`} caption={st.label}>
          <ToggleDemo initial {...force(st.forced)} />
        </Fig>
      ))}
      <Fig id="toggle-disabled" caption="Deshabilitado">
        <ToggleDemo initial={false} disabled />
      </Fig>
      <Fig id="toggle-cream" caption="Sobre crema con ayuda" cream>
        <ToggleDemo initial hint="Suena en el lobby." />
      </Fig>
      <Fig id="toggle-cream-focus" caption="Sobre crema · foco" cream>
        <ToggleDemo initial={false} forced="focus" hint="Suena en el lobby." />
      </Fig>
    </Section>
  );
}

function BadgeSection() {
  return (
    <Section name="badge" title="Badge">
      {(['yellow', 'navy', 'cream'] as const).map((tone) => (
        <Fig key={tone} id={`badge-${tone}`} caption={`Tono ${tone}`}>
          <Badge tone={tone}>12</Badge>
        </Fig>
      ))}
    </Section>
  );
}

function TypeBadgeSection() {
  return (
    <Section name="typebadge" title="TypeBadge (18 tipos)">
      {TYPES.map((type) => (
        <Fig key={type} id={`typebadge-${type}`} caption={pokemonTypeLabels[type]}>
          <span className={s.iconRow}>
            <TypeBadge type={type} label={pokemonTypeLabels[type]} />
            <TypeBadge type={type} label={pokemonTypeLabels[type]} size="sm" />
          </span>
        </Fig>
      ))}
    </Section>
  );
}

function ChipSection() {
  const chips = [
    { tone: 'ok', label: 'Listo' },
    { tone: 'warn', label: 'Esperando' },
    { tone: 'bad', label: 'Expulsado' },
    { tone: 'info', label: 'Anfitrión' },
    { tone: 'neutral', label: 'Invitado' },
  ] as const;
  return (
    <Section name="chip" title="Chip">
      {chips.map((c) => (
        <Fig key={c.tone} id={`chip-${c.tone}`} caption={`Tono ${c.tone}`}>
          <Chip tone={c.tone} {...(c.tone === 'info' ? { icon: <Icon icon={Zap} size={18} /> } : {})}>
            {c.label}
          </Chip>
        </Fig>
      ))}
    </Section>
  );
}

function BarSection() {
  const tones = [
    { tone: 'yellow', value: 7 },
    { tone: 'ok', value: 10 },
    { tone: 'bad', value: 2 },
    { tone: 'info', value: 5 },
    { tone: 'player', value: 8 },
  ] as const;
  return (
    <Section name="bar" title="Bar">
      {tones.map((b) => (
        <Fig key={b.tone} id={`bar-${b.tone}`} caption={`Tono ${b.tone}`}>
          <span className={s.barBox}>
            <Bar value={b.value} max={10} tone={b.tone} label={`Progreso ${b.tone}`} showValue />
          </span>
        </Fig>
      ))}
    </Section>
  );
}

function TimerSection() {
  return (
    <Section name="timer" title="Timer">
      <Fig id="timer-normal" caption="Normal (20 s de 30)">
        <span className={s.barBox}>
          <Timer endsAt={NOW + 20_000} now={NOW} totalMs={30_000} />
        </span>
      </Fig>
      <Fig id="timer-urgent" caption="Urgente (3 s)">
        <span className={s.barBox}>
          <Timer endsAt={NOW + 3_000} now={NOW} totalMs={30_000} />
        </span>
      </Fig>
      <Fig id="timer-idle" caption="Sin temporizador">
        <span className={s.barBox}>
          <Timer endsAt={null} now={NOW} totalMs={30_000} />
        </span>
      </Fig>
    </Section>
  );
}

function RowSection() {
  return (
    <Section name="row" title="Row">
      <Fig id="row-normal" caption="Normal" wide>
        <Row rank={1} name="Misty" meta="Anfitriona" value="12 pts" color="var(--info)" />
      </Fig>
      <Fig id="row-self" caption="Propia" wide>
        <Row rank={2} name="Ash (tú)" meta="Listo" value="9 pts" color="var(--yellow)" self />
      </Fig>
      <Fig id="row-disconnected" caption="Desconectada" wide>
        <Row rank={3} name="Brock" value="4 pts" color="var(--ok)" disconnected />
      </Fig>
      <Fig id="row-long" caption="Nombre largo recortado" wide>
        <Row rank={4} name="Entrenadora con un nombre larguísimo de verdad" value="0 pts" color="var(--red)" />
      </Fig>
    </Section>
  );
}

const CARD_STATES: { state: CardState; label: string }[] = [
  { state: 'idle', label: 'Reposo' },
  { state: 'selected', label: 'Seleccionada' },
  { state: 'correct', label: 'Correcta' },
  { state: 'wrong', label: 'Incorrecta' },
  { state: 'revealing', label: 'Revelándose' },
];
const PIKACHU_TYPES = [{ type: 'electric' as const, label: pokemonTypeLabels.electric }];
const BULBASAUR_TYPES = [
  { type: 'grass' as const, label: pokemonTypeLabels.grass },
  { type: 'poison' as const, label: pokemonTypeLabels.poison },
];

function CardSection() {
  const [selected, setSelected] = useState(false);
  return (
    <Section name="card" title="Card">
      {CARD_STATES.map((c) => (
        <Fig key={c.state} id={`card-${c.state}`} caption={c.label}>
          <Card name="Pikachu" number={25} types={PIKACHU_TYPES} state={c.state} />
        </Fig>
      ))}
      <Fig id="card-button" caption="Seleccionable (botón)">
        <Card name="Bulbasaur" number={1} types={BULBASAUR_TYPES} state={selected ? 'selected' : 'idle'} onSelect={() => setSelected((v) => !v)} />
      </Fig>
    </Section>
  );
}

function HudSection() {
  return (
    <Section name="hudplate" title="HudPlate">
      <Fig id="hudplate-left" caption="Izquierda">
        <HudPlate>
          <span className={s.text}>Ronda 3/10</span>
        </HudPlate>
      </Fig>
      <Fig id="hudplate-right" caption="Derecha">
        <HudPlate side="right">
          <span className={s.text}>12 pts</span>
        </HudPlate>
      </Fig>
    </Section>
  );
}

function DialogSection({ onToast }: { onToast(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <Section name="dialog" title="Dialog">
      <Fig id="dialog-open" caption="Abre el diálogo de ejemplo">
        <Pill variant="yellow" onClick={() => setOpen(true)}>
          Abrir diálogo
        </Pill>
      </Fig>
      <Fig id="dialog-audio" caption="Ajustes de sonido (contenido del diálogo)" cream>
        <AudioSettingsPanel settings={{ muted: false, master: 75, music: 50, sfx: 75, ui: 25 }} onPatch={noop} onTest={noop} />
      </Fig>
      <Dialog
        open={open}
        title="Diálogo de ejemplo"
        onClose={() => setOpen(false)}
        actions={[
          { label: 'Aceptar', onClick: noop, autoFocus: true },
          { label: 'Cancelar', variant: 'ghost', onClick: noop },
        ]}
      >
        <p>Crema, con contorno de 3 px. Esc, el fondo o una acción lo cierran y el foco vuelve al botón.</p>
        <Pill size="small" onClick={onToast}>
          Lanzar aviso
        </Pill>
      </Dialog>
    </Section>
  );
}

function ToastSection({ push }: { push: ReturnType<typeof useToasts>['push'] }) {
  return (
    <Section name="toast" title="Toast">
      <Fig id="toast-ok" caption="Aviso correcto">
        <Pill onClick={() => push('ok', 'Sala creada.')}>Aviso ok</Pill>
      </Fig>
      <Fig id="toast-error" caption="Aviso de error">
        <Pill variant="danger" onClick={() => push('error', 'No se pudo unir a la sala.')}>
          Aviso error
        </Pill>
      </Fig>
      <Fig id="toast-info" caption="Aviso informativo">
        <Pill variant="cream" onClick={() => push('info', 'Misty se ha unido.')}>
          Aviso info
        </Pill>
      </Fig>
    </Section>
  );
}

const CUTIN_TONES: { tone: CutinTone; label: string; title: string }[] = [
  { tone: 'yellow', label: 'Amarillo', title: '¡Ronda 1!' },
  { tone: 'red', label: 'Rojo', title: '¡Tiempo!' },
  { tone: 'info', label: 'Info', title: 'Turno de Misty' },
  { tone: 'ok', label: 'Correcto', title: '¡Correcto!' },
];

function CutinSection() {
  const [shown, setShown] = useState<{ tone: CutinTone; title: string; n: number } | null>(null);
  return (
    <Section name="cutin" title="Cutin">
      {CUTIN_TONES.map((c) => (
        <Fig key={c.tone} id={`cutin-${c.tone}`} caption={`Lanza el cut-in ${c.tone}`}>
          <Pill variant="cream" onClick={() => setShown((prev) => ({ tone: c.tone, title: c.title, n: (prev?.n ?? 0) + 1 }))}>
            {c.label}
          </Pill>
        </Fig>
      ))}
      {shown && <Cutin key={shown.n} tone={shown.tone} title={shown.title} subtitle="Cut-in de ejemplo" onDone={() => setShown(null)} />}
    </Section>
  );
}

function ScorePopSection() {
  const [n, setN] = useState(0);
  return (
    <Section name="scorepop" title="ScorePop">
      <Fig id="scorepop-trigger" caption="+N en el color del jugador">
        <span className={s.iconRow}>
          <Pill size="small" onClick={() => setN((v) => v + 1)}>
            Sumar puntos
          </Pill>
          <span className={s.popSlot}>{n > 0 && <ScorePop key={n} points={10} color="var(--yellow)" />}</span>
        </span>
      </Fig>
    </Section>
  );
}

function ScreenSplitSection() {
  return (
    <Section name="screensplit" title="ScreenSplit">
      <Fig id="screensplit-example" caption="Pantalla doble con lateral" wide>
        <div className={s.splitFrame}>
          <ScreenSplit
            top={
              <Panel title="Pantalla superior" variant="dark">
                <p className={s.text}>Escena del juego.</p>
              </Panel>
            }
            side={
              <Panel title="Jugadores" variant="dark">
                <Row rank={1} name="Misty" value="12" color="var(--info)" />
              </Panel>
            }
            bottom={
              <Panel title="Pantalla inferior">
                <p className={s.text}>Controles del jugador.</p>
              </Panel>
            }
          />
        </div>
      </Fig>
    </Section>
  );
}

export function Gallery() {
  const { toasts, push, close } = useToasts();

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('static')) return;
    document.body.classList.add('static');
    return () => document.body.classList.remove('static');
  }, []);

  return (
    <main className={s.page} data-testid="gallery">
      <header className={s.head}>
        <h1 className={s.title}>Galería del catálogo</h1>
        <p className={s.text}>Componentes de Arcade DS en todos sus estados. Solo en desarrollo.</p>
      </header>
      <PillSection />
      <PanelSection />
      <StateBoxSection />
      <IconSection />
      <TabsSection />
      <SegmentedSection />
      <FieldSection />
      <SliderSection />
      <ToggleSection />
      <BadgeSection />
      <TypeBadgeSection />
      <ChipSection />
      <BarSection />
      <TimerSection />
      <RowSection />
      <CardSection />
      <HudSection />
      <DialogSection onToast={() => push('info', 'Aviso sobre el diálogo', 20_000)} />
      <ToastSection push={push} />
      <CutinSection />
      <ScorePopSection />
      <ScreenSplitSection />
      <ToastStack toasts={toasts} onClose={close} />
    </main>
  );
}
