import type { PokeTabooHint, PokeTabooSecretPokemon } from '@pokemon-universe/shared/public';
import { Ban, LockKeyhole, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { pokemonTypeLabels } from '../../components/pokemon-type-labels';
import { guessSprite } from '../../room/guess-kit';
import { Badge, Card, Chip, cx, Field, Icon, Panel, Pill, Row } from '../../ui';
import { forbiddenHintMessage, TABOO_HINT_MAX, TABOO_MAX_HINTS, tabooForbiddenWords, tabooHintProblem } from './presentation';
import s from './PokeTaboo.module.css';

const decimal = (value: number) => value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function evolutionText(pokemon: PokeTabooSecretPokemon): string {
  if (pokemon.evolutionStageCount === null || pokemon.evolutionStage === null) return 'Sin datos de evolución';
  return pokemon.evolutionStageCount <= 1 ? 'No evoluciona' : `Etapa ${pokemon.evolutionStage} de ${pokemon.evolutionStageCount}`;
}

/**
 * El Pokémon secreto de quien describe (solo se monta con su estado propio: nunca llega al DOM de los demás). La carta
 * con sus tipos, las palabras prohibidas en rojo y, debajo, la ficha para describirlo: generación, evolución, altura,
 * peso, estadísticas, total y habilidades. En escritorio bajo la ficha se desplaza por dentro.
 */
export function TabooSecretPanel({ pokemon, className }: { pokemon: PokeTabooSecretPokemon; className?: string | undefined }) {
  const stats = [['PS', pokemon.hp], ['Ataque', pokemon.attack], ['Defensa', pokemon.defense], ['At. Esp.', pokemon.specialAttack], ['Def. Esp.', pokemon.specialDefense], ['Velocidad', pokemon.speed]] as const;
  const facts = [
    `Generación ${pokemon.generation}`,
    evolutionText(pokemon),
    ...(pokemon.heightDecimeters !== null ? [`${decimal(pokemon.heightDecimeters / 10)} m`] : []),
    ...(pokemon.weightHectograms !== null ? [`${decimal(pokemon.weightHectograms / 10)} kg`] : []),
  ];
  return <Panel variant="cream" title="Tu Pokémon secreto" right={<Chip tone="warn" icon={<Icon icon={LockKeyhole} size={18} />}>Solo lo ves tú</Chip>} scroll scrollLabel="Ficha de tu Pokémon secreto"
    className={cx(s.secret, className)} bodyClassName={cx(s.secretBody)}>
    <div className={s.secretGrid} data-testid="taboo-secret">
      <div className={s.secretCard}>
        <Card name={pokemon.name} sprite={guessSprite(pokemon.sprite)} types={pokemon.types.map((type) => ({ type, label: pokemonTypeLabels[type] }))} size="sm" eager attrs={{ 'data-testid': 'taboo-secret-card' }} />
      </div>
      <div className={s.secretInfo}>
        <section className={s.forbidden} aria-labelledby="taboo-forbidden-title">
          <h3 id="taboo-forbidden-title" className={s.subTitle}><Icon icon={Ban} size={18} />Palabras prohibidas</h3>
          <ul className={s.forbiddenList} data-testid="taboo-forbidden">{tabooForbiddenWords(pokemon).map((word) => <li key={word}><Chip tone="bad" icon={<Icon icon={Ban} size={18} />}>{word}</Chip></li>)}</ul>
          <p className={s.rule}>No puedes decir ni escribir su nombre (tampoco en otros idiomas). Descríbelo por voz o con pistas de texto.</p>
        </section>
        <ul className={s.facts} aria-label="Datos del Pokémon">
          {facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
        <dl className={s.stats} aria-label="Estadísticas base">
          {stats.map(([label, value]) => <div key={label} className={s.stat}><dt>{label}</dt><dd>{value}</dd></div>)}
          <div className={cx(s.stat, s.total)}><dt>Total de stats</dt><dd>{pokemon.baseStatTotal}</dd></div>
        </dl>
        {pokemon.abilities.length > 0 && <p className={s.abilities}><strong>Habilidades:</strong> {pokemon.abilities.join(', ')}</p>}
      </div>
    </div>
  </Panel>;
}

/**
 * Las pistas escritas del turno en franjas (`Row`): «Pista N» y el texto entero, partido en líneas; la última, destacada
 * con «Nueva». Sin pistas, cómo se juega (la descripción va por voz). No es región viva: la pista nueva la anuncia la de
 * la pantalla.
 */
export function TabooHintList({ hints, title, emptyTitle, emptyText, help, fresh = true, className }: {
  hints: readonly PokeTabooHint[];
  title: string;
  emptyTitle: string;
  emptyText: string;
  /** Línea bajo el título con pistas ya escritas (se oculta donde falta alto). */
  help?: string;
  /** Destaca la última con «Nueva» (durante el turno; en la revelación, no). */
  fresh?: boolean;
  className?: string | undefined;
}) {
  return <Panel variant="dark" title={title} right={<Badge tone="cream">{`${hints.length}/${TABOO_MAX_HINTS}`}</Badge>} scroll scrollLabel={title} className={cx(s.hints, className)} bodyClassName={cx(s.hintsBody)}
    status={hints.length === 0 ? { kind: 'empty', title: emptyTitle, text: emptyText, live: false } : null}>
    {help && <p className={s.hintsHelp}>{help}</p>}
    <ol className={s.hintRows} aria-label={title} data-testid="taboo-hints">{[...hints].reverse().map((hint, index) => <li key={hint.id} data-testid="taboo-hint">
      <Row name={`Pista ${hint.id}`} highlight={fresh && index === 0} meta={<span className={s.hintText}>“{hint.text}”</span>}
        {...(fresh && index === 0 ? { value: <Chip tone="info" icon={<Icon icon={Sparkles} size={18} />}>Nueva</Chip> } : {})} />
    </li>)}</ol>
  </Panel>;
}

/**
 * Campo de las pistas de quien describe (dentro de la placa de abajo): un `Field` de una línea con su contador `n / 180`
 * y la píldora «Enviar pista» (también con Intro). Antes de enviar comprueba la regla del motor con lo que sabe el
 * cliente: con una palabra prohibida, la ayuda del campo lo dice y la píldora no envía. El campo nunca se deshabilita al
 * enviar (el foco no cae al `body`) y, tras enviar, el foco vuelve a él. Si el servidor rechaza, el texto se conserva; el
 * error lo dice el aviso global de la sala (un dueño por error).
 */
export function TabooComposer({ secret, canSend, hintCount, fieldRef, onProblem, onSend }: {
  secret: PokeTabooSecretPokemon | null;
  canSend: boolean;
  hintCount: number;
  fieldRef: RefObject<HTMLInputElement | null>;
  /** Avisa a la pantalla de la palabra prohibida (para su región viva). */
  onProblem(word: string | null): void;
  onSend(text: string): Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const problem = tabooHintProblem(text, secret);
  const full = hintCount >= TABOO_MAX_HINTS;
  const ready = canSend && !full && !busy && text.trim().length > 0 && !problem;
  useEffect(() => { onProblem(problem); }, [problem, onProblem]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await onSend(text.trim());
      setText('');
    } catch {
      // Rechazada (cooldown, nombre en otro idioma, sin conexión): el aviso global lo dice; el texto se queda para corregirlo.
    } finally {
      sending.current = false;
      setBusy(false);
      fieldRef.current?.focus({ preventScroll: true });
    }
  }

  const hint = problem ? forbiddenHintMessage(problem)
    : full ? `Ya has enviado las ${TABOO_MAX_HINTS} pistas de este turno.`
      : 'Pulsa Intro para enviarla. Los que adivinan la verán al momento.';
  return <form className={s.composer} onSubmit={(event) => void submit(event)} {...(problem ? { 'data-invalid': 'true' } : {})}>
    <Field ref={fieldRef} label="Pista para los que adivinan" value={text} maxLength={TABOO_HINT_MAX} disabled={!canSend} hint={hint} autoComplete="off" enterKeyHint="send"
      {...(problem ? { 'aria-invalid': true } : {})} placeholder="Ej.: Camina sobre dos patas…" className={cx(s.composerField)} onChange={(event) => setText(event.target.value.slice(0, TABOO_HINT_MAX))} />
    <div className={s.composerSide}>
      <span className={cx(s.count, text.length >= TABOO_HINT_MAX && s.countFull)} data-testid="taboo-hint-count">{text.length} / {TABOO_HINT_MAX}</span>
      <Pill type="submit" variant="yellow" icon={Send} loading={busy} disabled={!ready} className={s.send} data-testid="taboo-hint-send">Enviar pista</Pill>
    </div>
  </form>;
}
