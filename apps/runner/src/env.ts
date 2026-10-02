import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  RUNNER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
});

export const env = envSchema.parse(process.env);
