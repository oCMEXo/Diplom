import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Requests per minute per address; 0 turns the limit off (the default for development). */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(0),
  /** The stricter limit for sign-in, registration and guest entry; 0 means "same as the general one". */
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(0).default(0),
  /** Behind a proxy or tunnel the real client address is in X-Forwarded-For. */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /** "false" turns off running visitors' code (no queue, no runner needed). */
  RUN_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** With a code set, running code and the terminal work only for people who entered it. */
  RUN_ACCESS_CODE: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(8).optional()),
});

export const env = envSchema.parse(process.env);
