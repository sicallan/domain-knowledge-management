import { InMemoryGraphAdapter } from "@dkm/knowledge-graph";
import { runLoaderPortContractTests } from "../src/contract";
import { GraphLoader } from "../src/index";

// The graph-loader must satisfy the same adapter-agnostic LoaderPort contract that
// every loader passes (spec 003; Feature 07's vector loader will reuse it). Each
// factory call gets a fresh loader over a fresh in-memory graph adapter.
runLoaderPortContractTests("GraphLoader", () => new GraphLoader(new InMemoryGraphAdapter()));
