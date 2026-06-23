import { builder } from "./builder";
// Importing the field modules registers their object types + query fields on the
// builder (side-effecting). Order is irrelevant — Pothos resolves refs lazily.
import "./entry";
import "./views";
import "./search";

/**
 * The assembled GraphQL schema — the **single contract** the studio reads over
 * (UI-D2). Snapshot-tested as SDL (`sdl.ts`), stateless, and injected with a seeded
 * backend at server/test construction.
 */
export const schema = builder.toSchema();
