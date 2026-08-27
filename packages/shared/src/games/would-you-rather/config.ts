import { z } from 'zod';
import { subjectivePromptSourceSchema } from '../config.js';

export const wouldYouRatherConfigSchema = z.object({
  rounds: z.number().int().min(1).max(10),
  roundSeconds: z.number().int().min(15).max(120),
  promptSource: subjectivePromptSourceSchema,
}).strict();

export type WouldYouRatherConfig = z.infer<typeof wouldYouRatherConfigSchema>;

export const defaultWouldYouRatherConfig: WouldYouRatherConfig = {
  rounds: 5,
  roundSeconds: 45,
  promptSource: 'OFFICIAL',
};
