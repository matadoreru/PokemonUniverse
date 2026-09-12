import { performance } from 'node:perf_hooks';
import { defaultSketchmonConfig, sketchmonGame } from '../packages/shared/dist/index.js';

const pokemon = { id: 'bulbasaur', name: 'Bulbasaur', nationalDexNumber: 1, generation: 1, sprite: '/1.png', types: ['grass'], hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45, baseStatTotal: 318 };
const context = { players: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, displayName: `Player ${i}` })), pokemon: { all: () => [pokemon], forGenerations: () => [pokemon], byId: () => pokemon, byDexNumber: () => pokemon }, now: 1_000, random: () => 0.5 };
let state = sketchmonGame.start(sketchmonGame.createInitialState(defaultSketchmonConfig, context), context);
const drawer = sketchmonGame.getPublicState(state, context).drawerId;
for (let i = 0; i < 128; i++) {
  const result = sketchmonGame.handleAction(state, drawer, { type: 'DRAW_BATCH', operations: [{ kind: 'START', stroke: { id: `stroke_${i}`, tool: 'PENCIL', color: '#182033', width: 8, points: Array.from({ length: 64 }, (_, j) => ({ x: j / 64, y: i / 128 })) } }] }, context);
  if (!result.accepted) throw new Error(result.error);
  state = result.state;
}
function measure(label, operation) {
  for (let i = 0; i < 10; i++) operation();
  const start = performance.now();
  for (let i = 0; i < 100; i++) operation();
  return { label, millisecondsPer100: Number((performance.now() - start).toFixed(2)) };
}
const timings = [
  measure('previous publication: 20 rooms × 8 public projections', () => { for (let room = 0; room < 20; room++) for (let player = 0; player < 8; player++) sketchmonGame.getPublicState(state, context); }),
  measure('current publication: 20 rooms × 1 public projection', () => { for (let room = 0; room < 20; room++) sketchmonGame.getPublicState(state, context); }),
];
const historyPointReferences = state.undoStack.reduce((total, strokes) => total + strokes.reduce((sum, stroke) => sum + stroke.points.length, 0), 0);
const uniqueHistoryPoints = new Set(state.undoStack.flatMap((strokes) => strokes.flatMap((stroke) => stroke.points))).size;
console.log(JSON.stringify({ node: process.version, scenario: '128 strokes × 64 points, 64 undo entries; synthetic projection CPU benchmark, excludes serialization/network', snapshotBytes: Buffer.byteLength(JSON.stringify(sketchmonGame.getPublicState(state, context))), historyPointReferences, uniqueHistoryPoints, timings }, null, 2));
