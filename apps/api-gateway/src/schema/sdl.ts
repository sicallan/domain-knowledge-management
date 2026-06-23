import { lexicographicSortSchema, printSchema } from "graphql";
import { schema } from "./index";

/**
 * The emitted SDL — the source of truth for the GraphQL contract (criterion 1).
 * Lexicographically sorted so the snapshot is stable regardless of definition order;
 * the snapshot test guards it, and the studio's codegen consumes it.
 */
export const sdl = printSchema(lexicographicSortSchema(schema));
