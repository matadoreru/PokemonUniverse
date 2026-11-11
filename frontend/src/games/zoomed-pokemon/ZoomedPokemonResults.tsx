import { ZoomIn } from 'lucide-react';
import type { GameResultsProps } from '../../room/room-command';
import { guessTop, type GuessStats } from '../../room/guess-kit';
import { GuessResults } from '../../room/guess-kit/GuessResults';

const maxZoomExtras = (stats: GuessStats) => [`${stats.maxZoomSolves ?? 0} a máximo zoom`];

/**
 * Resultados de Zoomed Pokémon: los comunes de los juegos de adivinar (`GuessResults`), más los aciertos a máximo zoom
 * en la línea de cada jugador y como tercer récord en lugar de «Al primer intento».
 */
export function ZoomedPokemonResults(props: GameResultsProps) {
  return <GuessResults {...props} gameName="Zoomed Pokémon" recordsId="zoomed-records-title" correctUnit={['Pokémon reconocido', 'Pokémon reconocidos']} fastestUnit="desde que salió el recorte"
    statsExtras={maxZoomExtras} thirdRecord={(entries) => {
      const maxZoom = guessTop(entries, 'maxZoomSolves');
      return { key: 'maxZoom', title: 'A máximo zoom', icon: ZoomIn, names: maxZoom?.names ?? null, value: maxZoom ? String(maxZoom.value) : '', unit: maxZoom?.value === 1 ? 'acierto con el primer recorte' : 'aciertos con el primer recorte' };
    }} />;
}
