export const FILE_TYPES = ["code", "doc", "board"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const PROJECT_ROLES = ["owner", "editor", "viewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const RUNNABLE_LANGUAGES = ["javascript", "python"] as const;
export type RunnableLanguage = (typeof RUNNABLE_LANGUAGES)[number];

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
