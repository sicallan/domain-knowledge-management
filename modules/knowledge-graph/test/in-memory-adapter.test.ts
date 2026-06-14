import { runGraphPortContractTests } from "../src/contract";
import { InMemoryGraphAdapter } from "../src/index";

// The in-memory adapter must satisfy the full, adapter-agnostic port contract.
// A future Neo4j adapter (D-P1.2) will call this same suite with its own factory.
runGraphPortContractTests("InMemoryGraphAdapter", () => new InMemoryGraphAdapter());
