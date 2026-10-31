// Escenarios dorados por motor. Los motores se importan del dist compilado de shared (la referencia
// congelada): npm run build -w @pokemon-universe/shared debe preceder a golden:export y check:golden.
import type { MiniGameModule } from '../../dist/index.js';
import type { GoldenScenario } from '../types.js';

export interface GoldenEngineEntry {
  module: MiniGameModule<any, any, any, any>;
  scenarios: GoldenScenario[];
  /** Entradas crudas para `configSchema.safeParse`. */
  configCases: unknown[];
}

export const scenarios: Record<string, GoldenEngineEntry> = {};
