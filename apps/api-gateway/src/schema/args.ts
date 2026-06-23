import { builder } from "./builder";

/**
 * Enums + input types shared by the resolvers. Enum **values** map the GraphQL
 * SCREAMING_CASE member to the lowercase string the `@dkm` ports expect (e.g.
 * `Direction.OUT → "out"`), so the SDL reads idiomatically while the service calls
 * stay verbatim.
 */

export const Direction = builder.enumType("Direction", {
  description: "Edge direction to follow in a traversal.",
  values: {
    IN: { value: "in" as const },
    OUT: { value: "out" as const },
    BOTH: { value: "both" as const },
  },
});

export const SortDirection = builder.enumType("SortDirection", {
  values: {
    ASC: { value: "asc" as const },
    DESC: { value: "desc" as const },
  },
});

export const FilterOp = builder.enumType("FilterOp", {
  values: {
    EQ: { value: "eq" as const },
    NEQ: { value: "neq" as const },
  },
});

export const SearchMode = builder.enumType("SearchMode", {
  values: {
    SEMANTIC: { value: "semantic" as const },
    KEYWORD: { value: "keyword" as const },
    HYBRID: { value: "hybrid" as const },
  },
});

export const PropertyFilterInput = builder.inputType("PropertyFilterInput", {
  description: "An equality/inequality predicate over an inventory entry property.",
  fields: (t) => ({
    field: t.string({ required: true }),
    op: t.field({ type: FilterOp, required: true }),
    value: t.field({ type: "JSON", required: true }),
  }),
});

export const SortInput = builder.inputType("SortInput", {
  fields: (t) => ({
    field: t.string({ required: true }),
    direction: t.field({ type: SortDirection, required: true }),
  }),
});
