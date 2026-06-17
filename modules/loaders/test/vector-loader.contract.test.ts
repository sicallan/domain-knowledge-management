import { runLoaderPortContractTests } from "../src/contract";
import { VectorLoader } from "../src/index";

// Primary OCP evidence (acceptance 1): the **unmodified** LoaderPort contract suite from
// Feature 03 passes against the second loader. Each factory call gets a fresh vector loader
// over its own deterministic fake embedder and in-memory index.
runLoaderPortContractTests("VectorLoader", () => new VectorLoader());
