import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  RUNNER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  /** Where browsers connect to terminals; 0 turns terminals off. */
  TERMINAL_PORT: z.coerce.number().int().min(0).default(3003),
  TERMINAL_HOST: z.string().default("0.0.0.0"),
  TERMINAL_MAX_PER_USER: z.coerce.number().int().min(1).default(2),
  TERMINAL_MAX_TOTAL: z.coerce.number().int().min(1).default(8),
});

export const env = envSchema.parse(process.env);
