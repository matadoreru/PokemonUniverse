/**
 * Galería del catálogo Arcade DS (solo desarrollo, `/dev/ui`; spec §4): cada componente de `src/ui` en todos sus
 * estados, con datos ficticios fijos y sin red. Cada sección lleva `data-gallery-section` y cada estado va en un
 * `<figure data-gallery="<componente>-<estado>">` que el E2E captura uno a uno. Con `?static` en la URL se añade la
 * clase `static` al `body` (sin animaciones ni transiciones).
 */
import { defaultWhoIsWhoPokemonConfig, POKEMON_TYPE_LABELS } from '@pokemon-universe/shared/public';
import { Bell, Bug, CheckCircle2, Clock3, Code2, Eye, Gamepad2, Heart, Link2, LogOut, MessagesSquare, Newspaper, Palette, Scale, Search, Send, Settings, ShieldCheck, Sparkles, Star, Trophy, UserPlus, SlidersHorizontal, WifiOff, Wrench, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { SettingsPanel } from '../../components/SettingsDialog';
import { ShortcutList } from '../../room/game-kit/ShortcutList';
import type { TextPreference } from '../../preferences/preferences';
import { Avatar } from '../../components/Avatar';
import { AvatarStack } from '../../components/AvatarStack';
import { GenerationSelector } from '../../components/GenerationSelector';
import { GameModeField, SessionModesProvider } from '../../games/common/GameModeField';
import { ServerTimer } from '../../components/ServerTimer';
import { AuctionLot, AuctionPrevious, BidControls, bidBlock, turnOrderEntries, type BidBlockInput } from '../../room/auction-kit';
import { ConfigRange } from '../../games/common/ConfigRange';
import { PaceField } from '../../games/common/PaceField';
import { applyPace } from '../../games/common/pace-presets';
import { playerColor } from '../../lib/player-color';
import { PokemonSelector } from '../../room/game-kit/PokemonSelector';
import { ResultsShell } from '../../room/game-kit/ResultsShell';
import { GameIntro } from '../../room/GameIntro';
import { GameHelpButton } from '../../room/GameHelpButton';
import { RevealNextControl } from '../../room/RevealNextControl';
import { SkipGameControl } from '../../room/SkipGameControl';
import { GuessStreakChip } from '../../room/guess-kit';
import { manifest as roomManifest, member as roomMember, roomView } from '../../room/test-support/room-view';
import type { ResultsStanding } from '../../room/game-kit/ResultsShell';
import type { PokemonType } from '../../styles/tokens';
import { typeColors } from '../../styles/tokens';
import { ActionPlate } from '../ActionPlate';
import { Badge, Chip, TypeBadge, TypeOption } from '../Badge';
import { Bar } from '../Bar';
import { Card } from '../Card';
import { ChatComposer } from '../ChatComposer';
import { ChatLog } from '../ChatLog';
import type { ChatLogItem } from '../ChatLog';
import { TextCard } from '../TextCard';
import type { CardState } from '../Card';
import { Confetti } from '../Confetti';
import { Cutin } from '../Cutin';
import type { CutinTone } from '../Cutin';
import type { ForcedState } from '../cx';
import { ConfirmDialog, Dialog } from '../Dialog';
import { Field, SelectField, TextArea } from '../Field';
import { HudPlate } from '../HudPlate';
import { Icon } from '../Icon';
import { Panel } from '../Panel';
import { HighlightCard, PatchHero, SectionRule, Timeline, TimelineLink } from '../Patch';
import type { PatchTone } from '../Patch';
import { Pill, PillAnchor, PillLink } from '../Pill';
import { Row, RowButton, RowLink } from '../Row';
import { ScorePop } from '../ScorePop';
import { ScoreValue } from '../ScoreValue';
import { MomentCutin } from '../MomentCutin';
import { AchievementTile } from '../AchievementTile';
import { Screen, ScreenHeader, type ScreenWidth } from '../Screen';
import { ScreenSplit } from '../ScreenSplit';
import { ScreenTransition } from '../ScreenTransition';
import { Segmented } from '../Segmented';
import { Kbd } from '../Kbd';
import { Slider } from '../Slider';
import { StateBox } from '../StateBox';
import { Notice } from '../Notice';
import { TabPanel, Tabs } from '../Tabs';
import { Timer } from '../Timer';
import { ToastStack, useToasts } from '../Toast';
import { ActionToast, ActionToastStack } from '../ActionToast';
import { Drawer } from '../Drawer';
import { Toggle } from '../Toggle';
import { UnownGlyph } from '../UnownGlyph';
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
      {STATES.map((st) => (
        <Fig key={`link-${st.key}`} id={`pill-link-${st.key}`} caption={`Enlace · ${st.label}`}>
          <PillLink to="/dev/ui" icon={ShieldCheck} {...force(st.forced)}>
            Administración
          </PillLink>
        </Fig>
      ))}
      <Fig id="pill-anchor" caption="Enlace externo (otra pestaña)">
        <PillAnchor href="https://discord.gg/8x2qfaDF4" icon={MessagesSquare}>
          Únete al Discord
        </PillAnchor>
      </Fig>
      <Fig id="pill-link-round" caption="Enlace redondo (solo icono)">
        <PillLink to="/dev/ui" size="round" icon={Newspaper} aria-label="Novedades" />
      </Fig>
      <Fig id="pill-link-current" caption="Enlace de cabecera · página actual (aria-current, amarillo y barra)">
        <PillLink nav to="/dev/ui" icon={ShieldCheck}>
          Administración
        </PillLink>
      </Fig>
      <Fig id="pill-link-round-current" caption="Enlace redondo · página actual">
        <PillLink nav to="/dev/ui" size="round" icon={Newspaper} aria-label="Novedades (página actual)" />
      </Fig>
      <Fig id="pill-link-yellow-main" caption="Enlace amarillo principal">
        <PillLink to="/dev/ui" variant="yellow" size="main">
          Empezar a jugar
        </PillLink>
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
      <Fig id="statebox-empty-actions" caption="Vacío compacto con dos acciones (sala con un solo jugador)">
        <StateBox kind="empty" compact title="Aún no ha llegado nadie" action={{ label: 'Copiar enlace', icon: Link2, onClick: noop }} secondaryAction={{ label: 'Invitar amigos', icon: UserPlus, onClick: noop }} live={false} />
      </Fig>
      <Fig id="statebox-empty-icon" caption="Vacío con icono propio, sin región viva (intentos de un juego)">
        <StateBox kind="empty" icon={Search} title="Todavía no hay intentos." text="El primero que acierte gana la ronda." live={false} />
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

function NoticeSection() {
  return (
    <Section name="notice" title="Notice">
      <Fig id="notice-warn" caption="En línea · esperando (host reconectando)" wide>
        <Notice icon={WifiOff} tone="warn" title="El host está reconectando." text="La sala conserva la configuración y esperará antes de transferir el control." />
      </Fig>
      <Fig id="notice-busy" caption="Flotante · en marcha, con anillo (conectando)" wide>
        <Notice floating busy icon={WifiOff} tone="warn" title="Conectando con la sala" text="Estamos recuperando el estado de la sesión." />
      </Fig>
      <Fig id="notice-bad" caption="Flotante · perdido (conexión perdida)" wide>
        <Notice floating icon={WifiOff} tone="bad" title="Conexión perdida" text="Reconectando… Tu sesión sigue guardada." />
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

/** «Ritmo» de Quién es Quién: elegir un ritmo lo marca; con un ajuste tocado a mano no hay ninguno marcado. */
function PaceDemo({ initial = defaultWhoIsWhoPokemonConfig }: { initial?: unknown }) {
  const [config, setConfig] = useState<unknown>(initial);
  return <PaceField gameId="who-is-who-pokemon" config={config} disabled={false} onChange={setConfig} />;
}

function SegmentedBlockDemo() {
  const [value, setValue] = useState<TextPreference>('xlarge');
  return <div className="w-72"><Segmented block showLabel value={value} onChange={setValue} label="Texto" options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Grande' }, { value: 'xlarge', label: 'Muy grande' }]} /></div>;
}

function SegmentedDemo({ forced, disabledOption, showLabel, hint }: { forced?: ForcedState; disabledOption?: boolean; showLabel?: boolean; hint?: string }) {
  const [value, setValue] = useState(60);
  const options = [
    { value: 30, label: '30 s' },
    { value: 60, label: '60 s' },
    { value: 90, label: '90 s', disabled: Boolean(disabledOption) },
  ];
  return <Segmented value={value} options={options} onChange={setValue} label="Tiempo por ronda" {...force(forced)} {...(showLabel ? { showLabel } : {})} {...(hint ? { hint } : {})} />;
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
      <Fig id="segmented-label" caption="Sobre crema con etiqueta visible" cream>
        <SegmentedDemo showLabel />
      </Fig>
      <Fig id="segmented-label-hint" caption="Sobre crema con etiqueta y ayuda" cream>
        <SegmentedDemo showLabel hint="Cuanto antes aciertes, más puntos." />
      </Fig>
      <Fig id="segmented-label-hint-focus" caption="Sobre crema con etiqueta y ayuda · foco" cream>
        <SegmentedDemo showLabel hint="Cuanto antes aciertes, más puntos." forced="focus" />
      </Fig>
      <Fig id="segmented-none" caption="Sin ninguna marcada (valor fuera de las opciones)" cream>
        <Segmented<number> showLabel label="Tiempo por ronda" hint="Ninguna coincide: la primera recibe el foco." value={45} onChange={noop} options={[{ value: 30, label: '30 s' }, { value: 60, label: '60 s' }, { value: 90, label: '90 s' }]} />
      </Fig>
      <Fig id="segmented-block" caption="A todo el ancho (block): las opciones se reparten el sitio" cream>
        <SegmentedBlockDemo />
      </Fig>
    </Section>
  );
}

function KbdSection() {
  return (
    <Section name="kbd" title="Kbd">
      <Fig id="kbd-keys" caption="Teclas de atajo: números, letras, Intro y «?»">
        <span className={s.iconRow}><Kbd>1</Kbd><Kbd>A</Kbd><Kbd>Intro</Kbd><Kbd>?</Kbd></span>
      </Fig>
      <Fig id="kbd-pill" caption="En un botón, solo con ratón (fineOnly): «Confirmar» con Intro; en táctil o por debajo de 640 px no se ve" wide>
        <Pill variant="yellow" icon={Send} aria-keyshortcuts="Enter">Confirmar respuesta <Kbd fineOnly>Intro</Kbd></Pill>
      </Fig>
      <Fig id="kbd-help" caption="Sección «Atajos de teclado» del diálogo de ayuda («?»)" cream>
        <ShortcutList entries={[{ keys: ['A', '1'], label: 'Opción A: Pikachu' }, { keys: ['B', '2'], label: 'Opción B: Raichu' }, { keys: ['Enter'], label: 'Confirmar voto' }]} />
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
      <Fig id="field-code" caption="Código de sala (code)" cream>
        <Field label="Código de sala" placeholder="PIKA42" hint="Seis letras o números." code />
      </Fig>
      <Fig id="field-code-error" caption="Código de sala · con error" cream>
        <Field label="Código de sala" defaultValue="ZZZZZZ" error="No hay ninguna sala con ese código." code />
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
      {(['yellow', 'navy', 'cream', 'red'] as const).map((tone) => (
        <Fig key={tone} id={`badge-${tone}`} caption={`Tono ${tone}`}>
          <Badge tone={tone}>{tone === 'red' ? 'BETA' : '12'}</Badge>
        </Fig>
      ))}
    </Section>
  );
}

function TypeBadgeSection() {
  return (
    <Section name="typebadge" title="TypeBadge (18 tipos)">
      {TYPES.map((type) => (
        <Fig key={type} id={`typebadge-${type}`} caption={POKEMON_TYPE_LABELS[type]}>
          <span className={s.iconRow}>
            <TypeBadge type={type} label={POKEMON_TYPE_LABELS[type]} />
            <TypeBadge type={type} label={POKEMON_TYPE_LABELS[type]} size="sm" />
          </span>
        </Fig>
      ))}
      <Fig id="typesize-lg" caption="Grande (lg): la revelación del VS">
        <span className={s.iconRow}>
          <TypeBadge type="fire" label={POKEMON_TYPE_LABELS.fire} size="lg" />
          <TypeBadge type="ghost" label={POKEMON_TYPE_LABELS.ghost} size="lg" />
        </span>
      </Fig>
    </Section>
  );
}

function TypeOptionSection() {
  const states = [
    { id: 'normal', caption: 'Normal', props: {} },
    { id: 'hover', caption: 'Hover', props: { forced: 'hover' as const } },
    { id: 'focus', caption: 'Foco', props: { forced: 'focus' as const } },
    { id: 'active', caption: 'Pulsado', props: { forced: 'active' as const } },
    { id: 'pressed', caption: 'Elegido (aria-pressed)', props: { pressed: true } },
    { id: 'loading', caption: 'Elegido, enviando', props: { pressed: true, loading: true } },
    { id: 'disabled', caption: 'Deshabilitado', props: { disabled: true } },
  ];
  return (
    <Section name="typeoption" title="TypeOption (tipo seleccionable)">
      {states.map((state) => (
        <Fig key={state.id} id={`typeoption-${state.id}`} caption={state.caption}>
          <span className={s.iconRow}>
            <TypeOption type="fire" label={POKEMON_TYPE_LABELS.fire} pressed={false} {...state.props} />
            <TypeOption type="dark" label={POKEMON_TYPE_LABELS.dark} pressed={false} {...state.props} />
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
      <Fig id="bar-grow-lg" caption="Gruesa (lg) que crece al montarse (grow)">
        <span className={s.barBox}>
          <Bar value={63} max={80} tone="ok" label="Valor revelado" size="lg" grow showValue valueText="63" />
        </span>
      </Fig>
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
      <Fig id="timer-long-label" caption="Etiqueta larga (el turno de la subasta): puntos suspensivos">
        <span className={s.barBox}>
          <Timer endsAt={NOW + 13_000} now={NOW} totalMs={20_000} label="Turno de Bartolomeo_Entrenador" showLabel />
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
      <Fig id="row-highlight" caption="Destacada (recién llegada)" wide>
        <Row name="Rueda Fuego" meta="Fuego · Físico" value={<Badge>Nueva</Badge>} highlight />
      </Fig>
      <Fig id="row-disconnected" caption="Desconectada" wide>
        <Row rank={3} name="Brock" value="4 pts" color="var(--ok)" disconnected />
      </Fig>
      <Fig id="row-inline" caption="En una línea desde 1024 px (recuento: nombre, meta y valor)" wide>
        <Row inline name="Misty" meta={<><Badge>Más votada</Badge><span>Respuesta de Ana</span></>} value="2 votos" color="var(--info)" highlight />
      </Fig>
      <Fig id="row-long" caption="Nombre largo recortado" wide>
        <Row rank={4} name="Entrenadora con un nombre larguísimo de verdad" value="0 pts" color="var(--red)" />
      </Fig>
      <Fig id="row-link" caption="Enlace (lista con detalle)" wide>
        <RowLink to="/dev/ui" name="v0.9.0 · Pantalla de título" meta="3 de noviembre de 2026">
          <Badge>Nueva</Badge>
        </RowLink>
      </Fig>
      <Fig id="row-link-current" caption="Enlace · abierta ahora" wide>
        <RowLink to="/dev/ui" name="v0.8.0 · Una sala más completa" meta="11 de septiembre de 2026" current />
      </Fig>
      <Fig id="row-button" caption="Botón (abre el tablero de un rival) · suena «tap»" wide>
        <RowButton label="Ver tablero de Misty: 3 de 6 aciertos" onClick={noop} rank={1} name="Misty" meta="3 de 6 aciertos" value="3/6" color="var(--info)" cue={{ icon: Eye, text: 'Ver' }} />
      </Fig>
      <Fig id="row-button-highlight" caption="Botón · destacada (acaba de resolver)" wide>
        <RowButton label="Ver tablero de Brock: resuelto" onClick={noop} rank={2} name="Brock" meta="Resuelto" value="6/6" color="var(--ok)" highlight cue={{ icon: Eye, text: 'Ver' }} />
      </Fig>
    </Section>
  );
}

const CHAT_ITEMS: ChatLogItem[] = [
  { id: 'c1', author: 'Misty', authorTone: 'var(--blue-l)', time: '18:03', text: 'Hola a todos, ¿empezamos?', own: false },
  { id: 'c2', author: 'Ash', authorTone: 'var(--yellow)', time: '18:04', text: 'Listo para jugar', own: true },
  { id: 'c3', author: 'Entrenadora con un nombre larguísimo de verdad', authorTone: 'var(--type-fairy)', time: '18:05', text: 'Soy un nombre largo recortado con title', own: false },
  { id: 'c4', author: 'Brock', authorTone: 'var(--type-ice)', time: '18:06', text: 'ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss', own: false },
  { id: 'c5', author: 'Misty', authorTone: 'var(--blue-l)', time: '18:07', text: 'Eso es una *** y no se dice', own: false },
];

function ChatComposerDemo({ initial, busy, disabledReason }: { initial: string; busy?: boolean; disabledReason?: string }) {
  const [value, setValue] = useState(initial);
  return <ChatComposer value={value} onChange={setValue} onSubmit={noop} label="Escribe un mensaje" maxLength={200} busy={Boolean(busy)} disabledReason={disabledReason ?? null} />;
}

/** Chat del lobby: la lista de mensajes y el campo de escribir. */
function ChatSection() {
  const empty = <StateBox kind="empty" title="Aún no hay mensajes" text="Escribe el primero." live={false} onCream />;
  const moderateLabel = (i: ChatLogItem) => `Moderar el mensaje de ${i.author}`;
  return (
    <Section name="chat" title="ChatLog y ChatComposer">
      <Fig id="chatlog-empty" caption="ChatLog vacío" wide cream>
        <ChatLog items={[]} label="Mensajes del chat" empty={empty} />
      </Fig>
      <Fig id="chatlog-messages" caption="ChatLog con mensajes (propio, ajeno, nombre largo, palabra larga, ***)" wide cream>
        <ChatLog items={CHAT_ITEMS} label="Mensajes del chat" empty={empty} />
      </Fig>
      <Fig id="chatlog-moderate" caption="ChatLog con botones de moderar (el último no es moderable: sin botón)" wide cream>
        <ChatLog items={[...CHAT_ITEMS.slice(0, 2), { ...CHAT_ITEMS[2]!, moderatable: false }]} label="Mensajes del chat" empty={empty} onModerate={noop} moderateLabel={moderateLabel} />
      </Fig>
      <Fig id="chatlog-unseen" caption="ChatLog con «Ver mensajes nuevos»" wide cream>
        <ChatLog items={CHAT_ITEMS.slice(0, 2)} label="Mensajes del chat" empty={empty} forceUnseen />
      </Fig>
      <Fig id="chatcomposer-normal" caption="ChatComposer normal" wide cream>
        <ChatComposerDemo initial="Hola" />
      </Fig>
      <Fig id="chatcomposer-limit" caption="ChatComposer cerca del límite (contador)" wide cream>
        <ChatComposerDemo initial={'Un mensaje muy largo '.repeat(9).slice(0, 183)} />
      </Fig>
      <Fig id="chatcomposer-busy" caption="ChatComposer esperando el ack (busy)" wide cream>
        <ChatComposerDemo initial="Enviando esto" busy />
      </Fig>
      <Fig id="chatcomposer-muted" caption="ChatComposer silenciado" wide cream>
        <ChatComposerDemo initial="" disabledReason="Un moderador te ha silenciado en el chat de esta sala." />
      </Fig>
    </Section>
  );
}

const PATCH_TONES: { tone: PatchTone; label: string; icon: typeof Sparkles }[] = [
  { tone: 'ok', label: 'Nuevo', icon: Sparkles },
  { tone: 'yellow', label: 'Minijuegos', icon: Gamepad2 },
  { tone: 'orange', label: 'Balance', icon: Scale },
  { tone: 'info', label: 'Interfaz', icon: Palette },
  { tone: 'blue', label: 'Mejoras', icon: Wrench },
  { tone: 'red', label: 'Correcciones', icon: Bug },
  { tone: 'neutral', label: 'Técnico', icon: Code2 },
];

/** Notas de parche (Novedades): portada de versión, tarjetas destacadas, títulos de sección y línea de tiempo. */
function PatchSection() {
  return (
    <Section name="patch" title="Notas de parche">
      <Fig id="patch-hero" caption="Portada de versión · última, con resumen" wide>
        <PatchHero version="0.9.0" title="Pantalla de título Arcade DS" date="3 de noviembre de 2026" dateTime="2026-11-03" changes="7 cambios" summary="La portada se convierte en una pantalla de título y todas las páginas largas ganan paneles con su propio scroll." latest />
      </Fig>
      <Fig id="patch-hero-plain" caption="Portada de versión · sin resumen" wide>
        <PatchHero version="0.7.0" title="Primeros minijuegos" date="2 de julio de 2026" dateTime="2026-07-02" changes="1 cambio" />
      </Fig>
      {PATCH_TONES.map(({ tone, label, icon }) => (
        <Fig key={tone} id={`patch-highlight-${tone}`} caption={`Destacada · ${label}`} cream>
          <HighlightCard tone={tone} icon={icon} kind={label}>La portada es ahora una pantalla de título con el logotipo grande.</HighlightCard>
        </Fig>
      ))}
      <Fig id="patch-highlight-compact" caption="Destacada compacta (portada de Inicio)">
        <HighlightCard tone="ok" icon={Sparkles} kind="Nuevo" compact>Cabecera de placas con el sonido siempre a mano.</HighlightCard>
      </Fig>
      {PATCH_TONES.map(({ tone, label, icon }) => (
        <Fig key={`rule-${tone}`} id={`patch-rule-${tone}`} caption={`Sección · ${label}`} cream>
          <SectionRule tone={tone} icon={icon} label={label} count={2} />
        </Fig>
      ))}
      <Fig id="patch-timeline" caption="Línea de tiempo · abierta, nueva y normales" wide>
        <Timeline label="Versiones de ejemplo">
          <TimelineLink to="/dev/ui" version="0.9.0" title="Pantalla de título Arcade DS" date="3 de noviembre de 2026" dateTime="2026-11-03"><Badge tone="navy">Nueva</Badge></TimelineLink>
          <TimelineLink to="/dev/ui" version="0.8.0" title="Una sala más completa" date="11 de septiembre de 2026" dateTime="2026-09-11" current />
          <TimelineLink to="/dev/ui" version="0.7.0" title="Primeros minijuegos con un título larguísimo que se recorta" date="2 de julio de 2026" dateTime="2026-07-02" />
        </Timeline>
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
const PIKACHU_TYPES = [{ type: 'electric' as const, label: POKEMON_TYPE_LABELS.electric }];
const BULBASAUR_TYPES = [
  { type: 'grass' as const, label: POKEMON_TYPE_LABELS.grass },
  { type: 'poison' as const, label: POKEMON_TYPE_LABELS.poison },
];

function CardSection() {
  const [selected, setSelected] = useState(false);
  const [gameSelected, setGameSelected] = useState(true);
  const [textSelected, setTextSelected] = useState(false);
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
      <Fig id="card-game" caption="Minijuego (arte en lugar del sprite) · seleccionable">
        <Card size="sm" art="⚔️" name="Type Duel" state={gameSelected ? 'selected' : 'idle'} onSelect={() => setGameSelected((v) => !v)}>
          <span className="text-13 font-bold">+2 jugadores</span>
          <span className="flex flex-wrap justify-center gap-1">
            {gameSelected && <Badge tone="navy">Seleccionado</Badge>}
            <Badge>TOP</Badge>
          </span>
        </Card>
      </Fig>
      <Fig id="card-game-readonly" caption="Minijuego · solo lectura (sin botón), elegida">
        <Card size="sm" art="🕵️" name="Pokémon Impostor" state="selected">
          <span className="text-13 font-bold">+3 jugadores</span>
          <span className="flex flex-wrap justify-center gap-1">
            <Badge tone="navy">Seleccionado</Badge>
            <Badge tone="red">BETA</Badge>
          </span>
        </Card>
      </Fig>
      <Fig id="card-correct-flip" caption="Correcta que gira al revelarse (flip)">
        <Card name="Mew" number={151} state="correct" flip />
      </Fig>
      <Fig id="card-fill" caption="Llena (fill): el sprite crece con su celda · opción de un juego">
        <div className="grid h-56 w-full grid-cols-2 gap-3">
          <Card size="fill" name="Pikachu" art={<span className="text-34">⚡</span>} state="selected" onSelect={() => undefined} />
          <Card size="fill" name="Oricorio Estilo Apasionado" art={<span className="text-34">💃</span>} onSelect={() => undefined} />
        </div>
      </Fig>
      <Fig id="card-selected-mark" caption="Elegida con tic de esquina (selectedMark, marks=line): el estado no va solo en el tinte · orden de los minijuegos y final de la sesión">
        {/* Con el ancho de las cartas del lobby (una columna en el móvil, tres en escritorio): el tic no pisa el icono. */}
        <div className="grid w-full gap-3">
          <Card size="sm" art={<span className="text-34">∞</span>} name="Infinita" state="selected" selectedMark onSelect={() => undefined} />
          <Card size="sm" art={<span className="text-34">#</span>} name="Por partidas" selectedMark onSelect={() => undefined} />
        </div>
      </Fig>
      <Fig id="card-selected-mark-fill" caption="Llena con selectedMark: elegida y sin elegir">
        <div className="grid h-56 w-full grid-cols-2 gap-3">
          <Card size="fill" name="Tipo Fuego" art={<span className="text-34">+</span>} state="selected" selectedMark onSelect={() => undefined} />
          <Card size="fill" name="Tipo Agua" art={<span className="text-34">+</span>} selectedMark onSelect={() => undefined} />
        </div>
      </Fig>
      <Fig id="card-corner-marks" caption="Marcas en la esquina (marks=corner): elegida, correcta e incorrecta, con quién la eligió encima del sprite · el hueco del sprite no cambia">
        <div className="grid h-56 w-full grid-cols-3 gap-3">
          <Card size="fill" marks="corner" name="Pikachu" art={<span className="text-34">⚡</span>} state="selected" onSelect={() => undefined} />
          <Card size="fill" marks="corner" name="Mew" art={<span className="text-34">✨</span>} state="correct"
            artOverlay={<AvatarStack members={[{ id: 'a', name: 'Aqua' }, { id: 'b', name: 'Berry' }]} label="2 votos: Aqua y Berry" />} />
          <Card size="fill" marks="corner" name="Ditto" art={<span className="text-34">🫠</span>} state="wrong"
            artOverlay={<AvatarStack members={[{ id: 'c', name: 'Cira' }, { id: 'd', name: 'Dan' }, { id: 'e', name: 'Eli' }, { id: 'f', name: 'Fer' }]} label="4 votos: Cira, Dan, Eli y Fer" />} />
        </div>
      </Fig>
      <Fig id="card-photo" caption="Carta con avatar de inicial">
        <Card name="Aqua" art={<Avatar name="Aqua" size="xl" />} onSelect={() => undefined} />
      </Fig>
      <Fig id="card-photo-selected" caption="Avatar · elegido">
        <Card name="Berry" art={<Avatar name="Berry" size="xl" />} state="selected" onSelect={() => undefined} />
      </Fig>
      <Fig id="text-card" caption="TextCard · seleccionable (respuesta escrita)">
        <TextCard name="Respuesta 1" text="Se come los pasteles de los demás sin pedir permiso y encima se queja de que están secos." selected={textSelected} onSelect={() => setTextSelected((v) => !v)} />
      </Fig>
      <Fig id="text-card-states" caption="TextCard · pasar, foco, pulsada">
        <TextCard name="Respuesta 2" text="Ronca." forced="hover" onSelect={() => undefined} />
        <TextCard name="Respuesta 3" text="Nunca devuelve lo que pide." forced="focus" onSelect={() => undefined} />
        <TextCard name="Respuesta 4" text="Llega tarde siempre." forced="active" onSelect={() => undefined} />
      </Fig>
      <Fig id="text-card-pair" caption="TextCard · grande con atajo (dos opciones enfrentadas)">
        <TextCard name="Opción A" text="Vivir un año dentro de una Poké Ball" shortcut="1" size="lg" selected onSelect={() => undefined} />
        <TextCard name="Opción B" text="Viajar siempre a lomos de un Magikarp" shortcut="2" size="lg" onSelect={() => undefined} />
      </Fig>
      <Fig id="text-card-player" caption="TextCard · jugador con avatar, fija (propia)">
        <TextCard name="Aqua" media={<Avatar name="Aqua" size="sm" />} detail="Eres tú"><Chip tone="neutral">Tu respuesta</Chip></TextCard>
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
      <Fig id="hudplate-block" caption={'size="block": a todo el ancho, el contenido baja si no cabe (ficha del perfil)'} wide>
        <HudPlate size="block">
          <span className="ol2 font-display text-26">Misty</span>
          <span className={s.text}>Miembro desde el 3 de noviembre de 2026</span>
          <span className={cx(s.text, 'basis-full')}>Nivel 4 · 320 XP en total</span>
        </HudPlate>
      </Fig>
      <Fig id="hudplate-size-header" caption={'size="header": cabecera de pantalla, en columna en móvil y en fila desde 1024 px'} wide>
        <HudPlate size="header">
          <span className="ol2 font-display text-26">Administración</span>
          <span className={s.text}>3 salas abiertas · 12 partidas hoy</span>
        </HudPlate>
      </Fig>
      <Fig id="hudplate-header" caption="Cabecera: logotipo, ajustes, novedades sin leer y salir" wide>
        <span className={s.iconRow}>
          <HudPlate>
            <span className="ol2 font-display text-26">Pokémon Universe</span>
            <Pill variant="cream" size="round" icon={SlidersHorizontal} aria-label="Ajustes (ejemplo)" />
          </HudPlate>
          <HudPlate>
            <span className="relative inline-flex">
              <PillLink to="/dev/ui" size="round" icon={Newspaper} aria-label="Novedades (ejemplo), 3 versiones sin leer" />
              <span className="pointer-events-none absolute -right-2 -top-2" data-layer aria-hidden="true">
                <Badge>3</Badge>
              </span>
            </span>
            <Pill size="round" variant="ghost" icon={LogOut} aria-label="Cerrar sesión (ejemplo)" />
          </HudPlate>
        </span>
      </Fig>
    </Section>
  );
}

function DialogSection({ onToast }: { onToast(): void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <Section name="dialog" title="Dialog">
      <Fig id="dialog-open" caption="Abre el diálogo de ejemplo">
        <Pill variant="yellow" onClick={() => setOpen(true)}>
          Abrir diálogo
        </Pill>
      </Fig>
      <Fig id="dialog-confirm" caption="ConfirmDialog: «Cancelar» primero y con el foco, la acción en peligro a la derecha">
        <Pill variant="danger" onClick={() => setConfirm(true)}>
          Terminar sesión
        </Pill>
      </Fig>
      <Fig id="dialog-audio" caption="Ajustes: sonido, movimiento y texto (contenido del diálogo)" cream>
        <SettingsPanel audio={{ muted: false, master: 75, music: 50, sfx: 75, ui: 25 }} display={{ motion: 'system', text: 'large' }} onAudio={noop} onDisplay={noop} />
      </Fig>
      <Dialog
        open={open}
        title="Diálogo de ejemplo"
        onClose={() => setOpen(false)}
        actions={[
          { label: 'Cancelar', variant: 'ghost', onClick: noop },
          { label: 'Aceptar', variant: 'yellow', onClick: noop, autoFocus: true },
        ]}
      >
        <p>Crema, con contorno de 3 px. Esc, el fondo o una acción lo cierran y el foco vuelve al botón.</p>
        <Pill size="small" onClick={onToast}>
          Lanzar aviso
        </Pill>
      </Dialog>
      <ConfirmDialog open={confirm} title="¿Terminar la sesión?" onClose={() => setConfirm(false)} confirmLabel="Terminar sesión" onConfirm={noop}>
        <p>La sesión acaba para toda la sala y se enseña la clasificación final. No se puede deshacer.</p>
      </ConfirmDialog>
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

function DrawerSection() {
  const [open, setOpen] = useState(false);
  return (
    <Section name="drawer" title="Drawer">
      <Fig id="drawer-open" caption="Abre el panel lateral con contenido largo">
        <Pill variant="yellow" onClick={() => setOpen(true)}>
          Abrir drawer
        </Pill>
      </Fig>
      <Drawer open={open} title="Amigos" onClose={() => setOpen(false)}>
        {Array.from({ length: 30 }, (_, i) => (
          <p key={i}>Amigo {i + 1}: contenido largo que se desplaza dentro del panel.</p>
        ))}
      </Drawer>
    </Section>
  );
}

function ActionToastSection() {
  const [stacked, setStacked] = useState(false);
  return (
    <Section name="action-toast" title="ActionToast">
      <Fig id="action-toast-normal" caption="Aviso con acciones (alert)">
        <ActionToast title="Ash te invita a su sala" text="Sala ABCD · Pokédex Distance" primary={{ label: 'Unirme', onClick: noop }} secondary={{ label: 'Ahora no', onClick: noop }} />
      </Fig>
      <Fig id="action-toast-quiet" caption="Aviso discreto (sin región viva, para partidas)">
        <ActionToast quiet title="Misty se ha conectado" primary={{ label: 'Invitar', onClick: noop }} secondary={{ label: 'Cerrar', onClick: noop }} />
      </Fig>
      <Fig id="action-toast-status" caption="Aviso educado (role=status, fuera de partida: logros)">
        <ActionToast live="status" title="¡Logro desbloqueado!" text="Primera partida" primary={{ label: 'Ver mis logros', onClick: noop }} secondary={{ label: 'Cerrar', onClick: noop }} />
      </Fig>
      <Fig id="action-toast-stack" caption="Pila fija abajo a la derecha, en la capa superior (encima de un diálogo o un drawer)">
        <Pill variant="yellow" onClick={() => setStacked((v) => !v)}>
          {stacked ? 'Ocultar pila' : 'Mostrar pila'}
        </Pill>
      </Fig>
      <ActionToastStack label="Invitaciones">
        {stacked && <ActionToast key="ash" title="Ash te invita a su sala" text="Sala ABC234" primary={{ label: 'Unirse', onClick: noop }} secondary={{ label: 'Ahora no', onClick: () => setStacked(false) }} />}
      </ActionToastStack>
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
      <Fig id="scorepop-before" caption={'placement="before": a la izquierda de la cifra'} cream>
        <span className={s.iconRow}>
          <Pill size="small" onClick={() => setN((v) => v + 1)}>
            Sumar puntos
          </Pill>
          <strong className={s.popFigure}>{n > 0 && <ScorePop key={n} points={3} color="var(--ok)" placement="before" />}+3<small> puntos</small></strong>
        </span>
      </Fig>
    </Section>
  );
}

function ScoreValueSection() {
  const [points, setPoints] = useState(12);
  return (
    <Section name="scorevalue" title="ScoreValue">
      <Fig id="scorevalue-self" caption="Marcador propio: rebota y lanza el +N al subir" cream>
        <span className={s.iconRow}>
          <Pill size="small" onClick={() => setPoints((v) => v + 3)}>
            Sumar 3
          </Pill>
          <Pill size="small" variant="cream" onClick={() => setPoints(0)}>
            A cero
          </Pill>
          <strong className={s.popFigure}><ScoreValue value={points} self color="var(--yellow)"><small> pts</small></ScoreValue></strong>
        </span>
      </Fig>
      <Fig id="scorevalue-other" caption="Marcador de otro jugador: solo rebota" cream>
        <strong className={s.popFigure}><ScoreValue value={points}><small> pts</small></ScoreValue></strong>
      </Fig>
    </Section>
  );
}

type MomentSample = 'plain' | 'confetti' | 'turn' | 'winner' | 'winnerSelf';

const MOMENT_SAMPLES: Record<MomentSample, { title: string; subtitle?: string; confetti?: boolean; silent?: boolean; holdMs?: number; skippable?: boolean }> = {
  plain: { title: '¡Racha de 5!', subtitle: 'Momento de ejemplo' },
  confetti: { title: '¡BINGO!', subtitle: 'Momento de ejemplo', confetti: true },
  turn: { title: '¡Te toca!', silent: true, holdMs: 1_000, skippable: false },
  winner: { title: '¡Gana Misty!', subtitle: '“Se come los deberes de su entrenador”', silent: true },
  winnerSelf: { title: '¡Ganas tú!', subtitle: 'Pikachu', confetti: true, silent: true },
};

function MomentCutinSection() {
  const [shown, setShown] = useState<{ n: number; kind: MomentSample } | null>(null);
  const show = (kind: MomentSample) => setShown((prev) => ({ n: (prev?.n ?? 0) + 1, kind }));
  return (
    <Section name="momentcutin" title="MomentCutin">
      <Fig id="momentcutin-plain" caption="Momento sin región viva: clic o Espacio lo saltan">
        <Pill variant="cream" onClick={() => show('plain')}>Hito</Pill>
      </Fig>
      <Fig id="momentcutin-confetti" caption="Con confeti (nunca con movimiento reducido)">
        <Pill variant="cream" onClick={() => show('confetti')}>¡BINGO!</Pill>
      </Fig>
      <Fig id="momentcutin-turn" caption="«¡Te toca!»: corto (1 s), deja pasar el puntero y sin sonido propio (suena ui.open desde useTurnCue)">
        <Pill variant="cream" onClick={() => show('turn')}>¡Te toca!</Pill>
      </Fig>
      <Fig id="momentcutin-winner" caption="Ganador de la ronda social: sin sonido propio (la sala da game.reveal); confeti solo si ganas tú">
        <span className={s.iconRow}>
          <Pill variant="cream" onClick={() => show('winner')}>Gana otro</Pill>
          <Pill variant="cream" onClick={() => show('winnerSelf')}>Ganas tú</Pill>
        </span>
      </Fig>
      {shown && <MomentCutin key={shown.n} tone="yellow" {...MOMENT_SAMPLES[shown.kind]} confettiSeed={shown.n} onDone={() => setShown(null)} />}
    </Section>
  );
}

function AchievementTileSection() {
  const art = <Icon icon={Trophy} size={32} />;
  return (
    <Section name="achievement-tile" title="AchievementTile">
      <Fig id="achievement-tile-unlocked" caption="desbloqueado">
        <ul className={s.tileList}>
          <AchievementTile name="Primera victoria" description="Gana tu primera partida." state="unlocked" art={art} date="7 nov 2026" />
        </ul>
      </Fig>
      <Fig id="achievement-tile-locked" caption="bloqueado">
        <ul className={s.tileList}>
          <AchievementTile name="Racha de cinco" description="Gana cinco partidas seguidas." state="locked" art={art} />
        </ul>
      </Fig>
      <Fig id="achievement-tile-secret" caption="secreto">
        <ul className={s.tileList}>
          <AchievementTile name="???" description="Logro secreto." state="secret" art={art} />
        </ul>
      </Fig>
      <Fig id="achievement-tile-fresh" caption="recién desbloqueado (anima una vez)">
        <ul className={s.tileList}>
          <AchievementTile name="Veterano" description="Juega cien partidas." state="unlocked" art={art} date="Hoy" fresh />
        </ul>
      </Fig>
    </Section>
  );
}

function UnownGlyphSection() {
  const glyphs = Array.from({ length: 26 }, (_, i) => i);
  return (
    <Section name="unown-glyph" title="Glifos Unown">
      <Fig id="unown-glyph-all" caption="Los 26 glifos (md, ocultos): símbolos, no letras" wide>
        <span className={s.glyphGrid}>
          {glyphs.map((glyph) => (
            <UnownGlyph key={glyph} glyph={glyph} />
          ))}
        </span>
      </Fig>
      <Fig id="unown-glyph-legend" caption="Leyenda (sm) con las letras ya descubiertas" wide cream>
        <span className={s.glyphGrid}>
          {glyphs.map((glyph) => (
            <UnownGlyph key={glyph} glyph={glyph} size="sm" letter={String.fromCharCode(65 + glyph)} />
          ))}
        </span>
      </Fig>
      <Fig id="unown-glyph-hidden" caption="oculto (glifo oculto)">
        <UnownGlyph glyph={15} size="lg" />
      </Fig>
      <Fig id="unown-glyph-known" caption="descubierto (letra P debajo)">
        <UnownGlyph glyph={15} size="lg" letter="P" />
      </Fig>
      <Fig id="unown-glyph-replace" caption="descubierto en el mensaje (la P en lugar del glifo)" cream>
        <UnownGlyph glyph={15} size="lg" letter="P" reveal="replace" />
      </Fig>
      <Fig id="unown-glyph-message" caption="mensaje medio traducido: letras y glifos del mismo tamaño" wide cream>
        <span className={s.glyphGrid}>
          {[...'PIKACHU'].map((letter, index) => {
            const glyph = letter.charCodeAt(0) - 65;
            return <UnownGlyph key={index} glyph={glyph} size="lg" reveal="replace" {...('PA'.includes(letter) ? { letter } : {})} />;
          })}
        </span>
      </Fig>
      <Fig id="unown-glyph-sizes" caption="sm, md y lg" cream>
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <UnownGlyph key={size} glyph={20} size={size} letter="U" />
        ))}
      </Fig>
    </Section>
  );
}

function ConfettiSection() {
  const [n, setN] = useState(0);
  return (
    <Section name="confetti" title="Confetti">
      <Fig id="confetti-burst" caption="Lluvia de confeti (acierto exacto) · contenida aquí; en un juego cubre la pantalla · sin movimiento no se pinta" wide>
        <span className={s.iconRow}>
          <Pill size="small" onClick={() => setN((v) => v + 1)}>
            Celebrar
          </Pill>
        </span>
        <div className="relative h-40 w-full">
          <Confetti key={n} contained seed={n + 1} count={40} />
        </div>
      </Fig>
    </Section>
  );
}

function ScreenTransitionSection() {
  const [n, setN] = useState(0);
  return (
    <Section name="screentransition" title="ScreenTransition">
      <Fig id="screentransition-replay" caption="Entrada de pantalla (se repite al cambiar la clave)" wide>
        <span className={s.iconRow}>
          <Pill size="small" onClick={() => setN((v) => v + 1)}>
            Cambiar de pantalla
          </Pill>
          <ScreenTransition routeKey={`pantalla-${n}`}>
            <Panel title={`Pantalla ${n + 1}`} variant="dark">
              <p className={s.text}>Opacidad y 8 px hacia arriba.</p>
            </Panel>
          </ScreenTransition>
        </span>
      </Fig>
    </Section>
  );
}

/** Placa de acción (pantalla inferior de los juegos): estado, lo que toca a la derecha y, debajo, lo que se usa. */
function ActionPlateSection() {
  return (
    <Section name="action-plate" title="ActionPlate">
      <Fig id="action-plate-points" caption="Acierto con los puntos a la derecha" wide>
        <ActionPlate titleId="gallery-plate-ok" icon={CheckCircle2} tone="ok" kicker={<Badge>1.º en acertar</Badge>} title="¡Era Pikachu!" text="Has acertado al segundo intento."
          aside={<strong className={s.popFigure}>+3<small> puntos</small></strong>} />
      </Fig>
      <Fig id="action-plate-wait" caption="Espera con aviso a la derecha (tono info)" wide>
        <ActionPlate titleId="gallery-plate-wait" icon={Clock3} tone="info" kicker="Ronda 3" title="Esperando al resto" text="La ronda acaba cuando respondan todos o se agote el tiempo."
          aside={<Chip tone="info" icon={<Icon icon={Clock3} size={18} />}>Faltan 2 jugadores</Chip>} />
      </Fig>
      <Fig id="action-plate-search" caption="search: el título a la izquierda y el campo a la derecha desde 1024 px" wide>
        <ActionPlate titleId="gallery-plate-search" icon={Eye} tone="warn" kicker="Tu turno" title="¿Qué Pokémon es?" text="Escribe al menos dos letras." search
          body={<Field label="Buscar Pokémon" placeholder="Pikachu" value="" onChange={noop} />} />
      </Fig>
      <Fig id="action-plate-compact" caption="compact: una sola fila sin icono en escritorio (Sketchmon)" wide>
        {/* Con el buscador de verdad: en compacto, lo que sigue al campo (la bandeja) se abre hacia arriba, sobre la escena. */}
        <ActionPlate titleId="gallery-plate-compact" icon={Eye} tone="warn" kicker="Adivina" title="¿Qué está dibujando?" search compact
          body={<PokemonSelector variant="embedded" pokemon={SELECTOR_POKEMON} locked={new Set()} disabled={false} autoFocus={false} inputLabel="Buscar Pokémon" onSelect={asyncNoop} />} />
      </Fig>
    </Section>
  );
}

const SCREEN_WIDTHS: { width: ScreenWidth; label: string }[] = [
  { width: 'narrow', label: 'narrow · tarjeta (520 → 640 px)' },
  { width: 'medium', label: 'medium · lectura (760 → 960 px)' },
  { width: 'form', label: 'form · formulario (1100 → 1200 px)' },
  { width: 'wide', label: 'wide · completo (por defecto)' },
];

/** Pantalla pública y su cabecera, cada una en un marco de alto fijo: `Screen` llena el alto del `main` desde 1024 px. */
function ScreenSection() {
  return (
    <Section name="screen" title="Screen y ScreenHeader">
      {SCREEN_WIDTHS.map(({ width, label }) => (
        <Fig key={width} id={`screen-${width}`} caption={`Ancho ${label}`} wide>
          <div className={s.screenFrame}>
            <Screen width={width}>
              <Panel title={width} variant="cream">
                <p className={s.textInk}>El contenido se centra y no pasa de su ancho.</p>
              </Panel>
            </Screen>
          </div>
        </Fig>
      ))}
      <Fig id="screen-footer" caption="Con pie (la línea legal, al fondo en escritorio)" wide>
        <div className={s.screenFrame}>
          <Screen width="medium" footer={<p className={s.text}>Pokémon Universe · aviso legal</p>}>
            <Panel title="Contenido" variant="cream">
              <p className={s.textInk}>Centrado en el hueco que deja el pie.</p>
            </Panel>
          </Screen>
        </div>
      </Fig>
      <Fig id="screen-fill" caption="fill: el contenido llena el alto (listas con scroll interno)" wide>
        <div className={s.screenFrame}>
          <Screen width="medium" fill>
            <Panel title="Lista" variant="dark" scroll scrollLabel="Lista de ejemplo" className={s.fillPanel ?? ''}>
              {['Misty', 'Ash', 'Brock', 'Gary', 'Serena'].map((name, i) => <Row key={name} rank={i + 1} name={name} value={`${12 - i * 2} pts`} color={playerColor(i)} />)}
            </Panel>
          </Screen>
        </div>
      </Fig>
      <Fig id="screenheader-aside" caption="ScreenHeader con entradilla y acción" wide>
        <ScreenHeader title="Novedades" subtitle="Lo último de Pokémon Universe" aside={<Pill size="small" onClick={noop}>Volver</Pill>} />
      </Fig>
      <Fig id="screenheader-center" caption="ScreenHeader centerOnMobile (centrada por debajo de 1024 px)" wide>
        <ScreenHeader title="Entra en la sala" subtitle="Escribe el código que te han pasado" centerOnMobile />
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

/* Intro de partida (E1) y «Cómo se juega» (Q2), con una sala ficticia de Pokémon Trivia. */
const INTRO_TRIVIA = roomManifest({ id: 'pokemon-trivia', name: 'Pokémon Trivia', howTo: [
  'Responded preguntas sobre tipos, generaciones, estadísticas y medidas.',
  'Cada acierto vale 100 puntos, y hasta 100 más cuanto antes respondáis.',
  'Solo hay una respuesta por pregunta: en cuanto elegís, queda bloqueada.',
] });
const INTRO_MEMBERS = [roomMember({ id: 'misty', displayName: 'Misty', isHost: true, roomRole: 'HOST' }), roomMember({ id: 'ash', displayName: 'Ash' }),
  roomMember({ id: 'brock', displayName: 'Brock' }), roomMember({ id: 'gary', displayName: 'Gary', role: 'SPECTATOR' })];

function introRoom(readyPlayerIds: string[], now: number) {
  return roomView({ phase: 'GAME_INTRO', selectedGameId: 'pokemon-trivia', availableGames: [INTRO_TRIVIA], members: INTRO_MEMBERS, serverNow: now,
    gameSkipState: { gameInstanceId: '00000000-0000-4000-8000-000000000001', voterIds: [], votes: 0, requiredVotes: 3, currentUserVoted: false, canVote: true },
    intro: { endsAt: now + 6_000, playerIds: ['misty', 'ash', 'brock'], readyPlayerIds } });
}

function GameIntroSection() {
  // Hora fija al montar: la cuenta atrás corre, pero no depende de cuándo se capture.
  const [now] = useState(() => Date.now());
  return (
    <Section name="game-intro" title="Intro de partida y «Cómo se juega»">
      <Fig id="game-intro-reading" caption="Intro · nadie listo todavía (jugador: «¡Listo!» activo)" wide>
        <div className={s.introFrame}><GameIntro room={introRoom([], now)} selfId="ash" onReady={asyncNoop} /></div>
      </Fig>
      <Fig id="game-intro-ready" caption="Intro · ya listo, esperando al resto (Misty también)" wide>
        <div className={s.introFrame}><GameIntro room={introRoom(['misty', 'ash'], now)} selfId="ash" onReady={asyncNoop} /></div>
      </Fig>
      <Fig id="game-intro-spectator" caption="Intro · espectador: la ve, pero no cuenta" wide>
        <div className={s.introFrame}><GameIntro room={introRoom(['ash'], now)} selfId="gary" onReady={asyncNoop} /></div>
      </Fig>
      <Fig id="game-help-button" caption="«Cómo se juega» · píldora «?» de la placa de la sala (abre el diálogo de ayuda con las reglas)">
        <GameHelpButton room={{ ...introRoom([], now), phase: 'ROUND_ACTIVE', intro: null }} />
      </Fig>
    </Section>
  );
}

/* «Siguiente» en los revelados (E2) junto a «Saltar minijuego», y la racha de los juegos de adivinar (E6). */
const REVEAL_SKIP_STATE = { gameInstanceId: '00000000-0000-4000-8000-000000000002', voterIds: [], votes: 0, requiredVotes: 3, currentUserVoted: false, canVote: true };

function RevealNextSection() {
  const [ready, setReady] = useState<string[]>(['misty']);
  const reveal = { playerIds: ['misty', 'ash', 'brock'], readyPlayerIds: ready };
  return (
    <Section name="reveal-next" title="«Siguiente» en los revelados y rachas">
      <Fig id="reveal-next-idle" caption="Revelado · jugador sin pulsar (al pulsar queda marcado)">
        <div className="flex flex-wrap items-center gap-2">
          <RevealNextControl reveal={reveal} selfId="ash" connected onNext={async () => setReady((ids) => ids.includes('ash') ? ids : [...ids, 'ash'])} />
          <SkipGameControl state={REVEAL_SKIP_STATE} connected onSetVote={asyncNoop} />
        </div>
      </Fig>
      <Fig id="reveal-next-ready" caption="Revelado · ya pulsado, esperando al resto">
        <RevealNextControl reveal={{ playerIds: ['misty', 'ash', 'brock'], readyPlayerIds: ['misty', 'ash'] }} selfId="ash" connected onNext={asyncNoop} />
      </Fig>
      <Fig id="reveal-next-offline" caption="Revelado · sin conexión (desactivado); los espectadores no lo ven">
        <RevealNextControl reveal={reveal} selfId="brock" connected={false} onNext={asyncNoop} />
      </Fig>
      <Fig id="guess-streak" caption="Racha · «Racha ×N» en la placa de la ronda, desde el segundo acierto seguido">
        <div className="flex flex-wrap items-center gap-2"><GuessStreakChip streak={2} /><GuessStreakChip streak={5} /></div>
      </Fig>
    </Section>
  );
}

/* Piezas que comparten los minijuegos (F4): buscador, temporizador de servidor, deslizador, avatar y resultados. */
const SELECTOR_POKEMON = ['Pikachu', 'Pichu', 'Raichu', 'Pikachu Libre', 'Pikachu Coqueta', 'Chikorita', 'Chinchou'].map((name) => ({ id: name.toLowerCase(), name, sprite: '' }));
const asyncNoop = async () => undefined;
const RESULTS: ResultsStanding[] = [
  { id: 'misty', position: 1, name: 'Misty', points: 12, color: playerColor(0), meta: '4 aciertos · mejor racha 3' },
  { id: 'ash', position: 2, name: 'Ash', points: 9, color: playerColor(1), meta: '3 aciertos' },
  { id: 'brock', position: 3, name: 'Brock', points: 4, color: playerColor(2) },
  { id: 'gary', position: 4, name: 'Entrenador con un nombre larguísimo de verdad', points: 0, color: playerColor(3) },
];

/** Selector de generaciones que cambia de verdad (nunca vacío), como en un `ConfigPanel`. */
function GenerationSelectorDemo() {
  const [generations, setGenerations] = useState<number[]>([1, 2, 3, 4]);
  return <GenerationSelector selected={generations} label="Generaciones" description="El Pokémon secreto y todas las respuestas pertenecerán a estas generaciones." onChange={setGenerations} />;
}

/** «Modos que se juegan» (las tres formas de sesión) que cambia de verdad: el último marcado no se puede quitar. */
function SessionModesDemo({ initial, order = false }: { initial: string[]; order?: boolean }) {
  const [allowed, setAllowed] = useState<string[]>(initial);
  return <SessionModesProvider value={{ gameId: 'higher-lower', allowed, order, onChange: setAllowed }}>
    <GameModeField gameId="higher-lower" value="CLASSIC" onChange={noop} disabled={false} />
  </SessionModesProvider>;
}

const AUCTION_NAMES: Record<string, string> = { a: 'JejeGOz', b: 'Sitogc19', c: 'eru' };
const auctionName = (id: string) => AUCTION_NAMES[id] ?? 'Entrenador';
const AUCTION_WAIT: BidBlockInput = { participating: true, open: true, canRaise: false, canPass: false, leading: true, min: 4, max: 17, turnName: 'JejeGOz',
  texts: { leading: { title: 'Le toca a JejeGOz', text: 'Tú vas ganando con 3 monedas.' } } };

/** Kit de subasta: el estado de la puja en una tarjeta (con el orden de turno y el lote anterior) y la placa sin tu turno. */
function AuctionSection() {
  return (
    <Section name="auction" title="Kit de subasta">
      <Fig id="auction-lot-status" caption="Estado de la puja · va ganando eru (Tú), le toca a Sitogc19, JejeGOz pasó; lote anterior encima" wide cream>
        <AuctionLot kicker="En subasta" item={<Card size="fill" name="Liepard" number={510} />} currentBid={3} minimumBid={4}
          leader={{ name: 'eru', self: true }} order={turnOrderEntries({ order: ['a', 'b', 'c'], turnId: 'b', passedIds: ['a'], leaderId: 'c' }, auctionName, 'c')}
          previous={<AuctionPrevious kicker="Lote 1" item="Vulpix" winner="Sitogc19" detail="2 monedas" />} />
      </Fig>
      <Fig id="auction-lot-empty" caption="Estado de la puja · sin pujas (puja mínima) y lote anterior sin dueño" wide cream>
        <AuctionLot kicker="En subasta" item={<Card size="fill" name="Liepard" number={510} />} currentBid={null} minimumBid={1} leader={null}
          order={turnOrderEntries({ order: ['a', 'b', 'c'], turnId: 'a', passedIds: [], leaderId: null }, auctionName, 'c')}
          previous={<AuctionPrevious kicker="Lote 1" item="Mewtwo" winner={null} detail="sin dueño" />} />
      </Fig>
      <Fig id="auction-controls-idle" caption="Placa de la puja · sin tu turno: el mensaje y el presupuesto, sin controles grises" wide>
        <BidControls titleRef={{ current: null }} block={bidBlock(AUCTION_WAIT)} min={4} max={17} epoch={1} budget={17} onBid={asyncNoop} onPass={asyncNoop} />
      </Fig>
    </Section>
  );
}

function GamePiecesSection() {
  // Plazo fijo al montar: el número corre, pero no depende de cuándo se capture.
  const [deadline] = useState(() => Date.now() + 45_000);
  return (
    <Section name="game-pieces" title="Piezas de juego">
      <Fig id="generation-selector" caption="Selector de generaciones · Gen 1–4 elegidas (ajustes, sobre crema)" wide cream>
        <GenerationSelectorDemo />
      </Fig>
      <Fig id="generation-selector-disabled" caption="Selector de generaciones · sin permiso (fieldset deshabilitado)" wide cream>
        <fieldset disabled>
          <GenerationSelector selected={[1, 9]} label="Generaciones del pool" onChange={noop} />
        </fieldset>
      </Fig>
      <Fig id="session-modes-both" caption="Modos que se juegan · los dos marcados (sesión al azar o por votación)" wide cream>
        <SessionModesDemo initial={['CLASSIC', 'ENDLESS']} />
      </Fig>
      <Fig id="session-modes-order" caption="Modos que se juegan · los dos marcados por orden (cada uno, un turno de la cola)" wide cream>
        <SessionModesDemo initial={['CLASSIC', 'ENDLESS']} order />
      </Fig>
      <Fig id="session-modes-last" caption="Modos que se juegan · el último marcado, deshabilitado (siempre queda uno)" wide cream>
        <SessionModesDemo initial={['ENDLESS']} />
      </Fig>
      <Fig id="selector-prompt" caption="Buscador · sin búsqueda (panel)" wide>
        <PokemonSelector pokemon={SELECTOR_POKEMON} locked={new Set()} disabled={false} autoFocus={false} onSelect={asyncNoop} />
      </Fig>
      <Fig id="selector-results" caption="Buscador · resultados (Pichu bloqueado, Enter elige Pikachu)" wide>
        <PokemonSelector pokemon={SELECTOR_POKEMON} locked={new Set(['pichu'])} disabled={false} autoFocus={false} initialQuery="chu" onSelect={asyncNoop} />
      </Fig>
      <Fig id="selector-loading" caption="Buscador · cargando (incrustado)" wide cream>
        <PokemonSelector variant="embedded" pokemon={[]} locked={new Set()} disabled={false} autoFocus={false} loading onSelect={asyncNoop} />
      </Fig>
      <Fig id="selector-error" caption="Buscador · error con Reintentar" wide cream>
        <PokemonSelector variant="embedded" pokemon={[]} locked={new Set()} disabled={false} autoFocus={false} loadError="No se pudo cargar el buscador de Pokémon. Comprueba la conexión." onRetry={noop} onSelect={asyncNoop} />
      </Fig>
      <Fig id="selector-empty" caption="Buscador · sin coincidencias" wide cream>
        <PokemonSelector variant="embedded" pokemon={SELECTOR_POKEMON} locked={new Set()} disabled={false} autoFocus={false} initialQuery="zzzz" onSelect={asyncNoop} />
      </Fig>
      <Fig id="servertimer-running" caption="Temporizador de servidor · en marcha">
        <ServerTimer deadline={deadline} serverOffset={0} totalMs={60_000} label="Siguiente ronda" />
      </Fig>
      <Fig id="servertimer-idle" caption="Temporizador de servidor · sin plazo">
        <ServerTimer deadline={null} serverOffset={0} label="Para votar" />
      </Fig>
      <Fig id="configrange" caption="Ajuste de configuración (ConfigRange)">
        <span className={s.barBox}>
          <ConfigRange label="Tiempo por ronda" value={30} min={10} max={60} step={5} formatValue={(v) => `${v} s`} hint="Lo que tiene cada jugador para elegir." onCommit={asyncNoop} />
        </span>
      </Fig>
      <Fig id="configrange-disabled" caption="Ajuste · solo lectura (invitado)">
        <span className={s.barBox}>
          <ConfigRange label="Número de rondas" value={5} min={1} max={10} disabled onCommit={asyncNoop} />
        </span>
      </Fig>
      <Fig id="pace" caption="Ritmo · Clásico (los valores por defecto)" cream>
        <PaceDemo />
      </Fig>
      <Fig id="pace-custom" caption="Ritmo · Personalizado (un ajuste tocado a mano)" cream>
        <PaceDemo initial={{ ...defaultWhoIsWhoPokemonConfig, rounds: 5 }} />
      </Fig>
      <Fig id="pace-disabled" caption="Ritmo · solo lectura (invitado)" cream>
        <PaceField gameId="who-is-who-pokemon" config={applyPace('who-is-who-pokemon', defaultWhoIsWhoPokemonConfig, 'FAST')} disabled onChange={noop} />
      </Fig>
      <Fig id="avatar-sizes" caption="Avatar · inicial en los seis tamaños">
        {(['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const).map((size) => (
          <Avatar key={size} name="Misty" size={size} />
        ))}
      </Fig>
      <Fig id="avatar-presence" caption="Avatar · inicial y presencia">
        <Avatar name="Aqua" size="lg" presence="CONNECTED" />
        <Avatar name="Brock" size="lg" presence="TEMPORARILY_DISCONNECTED" />
        <Avatar name="Gary" size="lg" presence="LEFT" />
      </Fig>
      <Fig id="avatar-level" caption="Avatar · nivel de la cuenta (los invitados no tienen)">
        <Avatar name="Aqua" size="sm" level={3} />
        <Avatar name="Brock" size="md" level={12} presence="CONNECTED" />
        <Avatar name="Misty" size="lg" level={99} presence="TEMPORARILY_DISCONNECTED" />
        <Avatar name="Gary" size="xl" level={7} />
        <Avatar name="Invitado" size="md" presence="CONNECTED" />
      </Fig>
      <Fig id="results-shell" caption="Resultados de partida (ResultsShell con clasificación; Ash eres tú)" wide>
        <ResultsShell title="Resultado de la partida" subtitle="Pokédex Distance · Partida 2" standings={RESULTS} selfId="ash">
          <p>Aquí cada juego añade lo suyo (mejor acierto, tablas) y las acciones del anfitrión.</p>
        </ResultsShell>
      </Fig>
      <Fig id="results-shell-aside" caption="Resultados de partida en dos columnas (ResultsShell con aside y acciones)" wide>
        <ResultsShell title="Resultado de la partida" subtitle="Pokédex Distance · Partida 2" standings={RESULTS} selfId="ash"
          aside={<Panel variant="cream" as="div"><p>Métricas propias del juego: mejor acierto, distancia por ronda…</p></Panel>}
          actions={<><Pill variant="yellow">Continuar sesión</Pill><Pill variant="ghost">Terminar sesión</Pill></>} />
      </Fig>
      <Fig id="results-shell-no-winner" caption="Resultados cooperativos (ResultsShell con noWinner: nadie lleva insignia de ganador)" wide>
        <ResultsShell title="Resultado del grupo" subtitle="Type Duel · Cooperativo · 3 rondas" standings={RESULTS} selfId="ash" noWinner />
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
      <NoticeSection />
      <IconSection />
      <TabsSection />
      <SegmentedSection />
      <KbdSection />
      <FieldSection />
      <SliderSection />
      <ToggleSection />
      <BadgeSection />
      <TypeBadgeSection />
      <TypeOptionSection />
      <ChipSection />
      <BarSection />
      <TimerSection />
      <RowSection />
      <ChatSection />
      <PatchSection />
      <CardSection />
      <HudSection />
      <DialogSection onToast={() => push('info', 'Aviso sobre el diálogo', 20_000)} />
      <ToastSection push={push} />
      <DrawerSection />
      <ActionToastSection />
      <CutinSection />
      <ScorePopSection />
      <ScoreValueSection />
      <MomentCutinSection />
      <AchievementTileSection />
      <UnownGlyphSection />
      <ConfettiSection />
      <ScreenTransitionSection />
      <ActionPlateSection />
      <ScreenSection />
      <ScreenSplitSection />
      <GameIntroSection />
      <RevealNextSection />
      <AuctionSection />
      <GamePiecesSection />
      <ToastStack toasts={toasts} onClose={close} />
    </main>
  );
}
