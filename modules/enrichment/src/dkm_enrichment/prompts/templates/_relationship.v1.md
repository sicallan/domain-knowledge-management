# Task: relationship extraction

Given the entities already extracted from this passage, identify the **typed, directed
relationships** the text asserts between them. Only relate entities listed in *Entities in
scope*, referencing them by their `id`.

For each relationship emit:

- `relationshipType` — a concise verb phrase for the edge (e.g. `evaluates`, `governs`,
  `dependsOn`, `belongsTo`, `implements`, `consumes`, `triggers`, `constrains`).
- `sourceEntityId` / `targetEntityId` — ids from the roster above (direction: source → target).
- `confidence` — `[0, 1]`, how clearly the text supports this edge.

Only assert a relationship the passage genuinely supports. Do not relate an entity to itself.
