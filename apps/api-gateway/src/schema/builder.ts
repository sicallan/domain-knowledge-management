import SchemaBuilder from "@pothos/core";
import { GraphQLScalarType, Kind } from "graphql";
import type { ValueNode } from "graphql";
import type { GraphQLContext } from "../context";

/**
 * The single Pothos schema builder for the gateway. Object types are defined as
 * `objectRef<T>` over the **`@dkm` result types** (UI-D3) — the GraphQL schema is a
 * projection of the Query Interface / View Projection result shapes, never a second
 * data model. The Query root is created here and extended via `builder.queryFields`
 * in `entry.ts` / `views.ts` / `search.ts` (OCP-open: new resolvers are additive).
 */
export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  // Non-null by default (the Pothos v3 default) so required base/view fields read as
  // `Type!` in the SDL; genuinely-optional fields are marked `nullable: true` explicitly.
  DefaultFieldNullability: false;
  Scalars: {
    JSON: { Input: unknown; Output: unknown };
  };
}>({ defaultFieldNullability: false });

function parseJSONLiteral(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
      return Number.parseInt(ast.value, 10);
    case Kind.FLOAT:
      return Number.parseFloat(ast.value);
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return ast.values.map(parseJSONLiteral);
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {};
      for (const field of ast.fields) obj[field.name.value] = parseJSONLiteral(field.value);
      return obj;
    }
    default:
      return undefined;
  }
}

/**
 * The `JSON` scalar — carries an `InventoryEntry`'s type-specific fields (the open
 * `InventoryEntry` index signature) as a single field, the Phase-3 escape hatch until
 * per-type GraphQL objects are generated from the JSON Schemas (feature 02 §11).
 */
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON — an inventory entry's full record incl. type-specific fields.",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => parseJSONLiteral(ast),
});

builder.addScalarType("JSON", JSONScalar);

builder.queryType({});
