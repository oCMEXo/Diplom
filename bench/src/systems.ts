import { shareDbSystem } from "./adapters/sharedb.js";
import type { SystemDefinition } from "./adapters/types.js";
import { yjsSystem } from "./adapters/yjs.js";

export const SYSTEMS: SystemDefinition[] = [yjsSystem, shareDbSystem];
