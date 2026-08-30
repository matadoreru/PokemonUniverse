import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const POKEMON_TRIVIA_QUESTION_TYPES = ['TYPE', 'GENERATION', 'HP', 'ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED', 'BST', 'HEIGHT', 'WEIGHT', 'DEX_NUMBER'] as const;
export type PokemonTriviaQuestionType = (typeof POKEMON_TRIVIA_QUESTION_TYPES)[number];
export const POKEMON_TRIVIA_DIFFICULTIES = ['EASY', 'NORMAL', 'HARD'] as const;
export type PokemonTriviaDifficulty = (typeof POKEMON_TRIVIA_DIFFICULTIES)[number];

export const pokemonTriviaConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(30),
  optionCount: z.number().int().min(3).max(4),
  difficulty: z.enum(POKEMON_TRIVIA_DIFFICULTIES),
  questionTypes: z.array(z.enum(POKEMON_TRIVIA_QUESTION_TYPES)).min(1).max(POKEMON_TRIVIA_QUESTION_TYPES.length),
}).strict().superRefine((config, context) => {
  if (config.questionTypes.length === 1 && config.questionTypes[0] === 'GENERATION' && config.generations.length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['generations'], message: 'Las preguntas de generación necesitan al menos dos generaciones.' });
  }
});

export type PokemonTriviaConfig = z.infer<typeof pokemonTriviaConfigSchema>;

export const defaultPokemonTriviaConfig: PokemonTriviaConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  rounds: 10,
  optionCount: 4,
  difficulty: 'NORMAL',
  questionTypes: [...POKEMON_TRIVIA_QUESTION_TYPES],
};
