import { fileURLToPath } from "node:url";
import { runSourceConnectorContractTests } from "../src/contract";
import { JsonConnector } from "../src/index";
import type { SourceConfig } from "../src/port";

const FIXTURES = fileURLToPath(new URL("./fixtures/json-source", import.meta.url));

// The `json` connector (Feature 06) must satisfy the *same* connector-agnostic
// port contract as the filesystem connector. Reusing this suite unchanged — only
// supplying a json harness — is the primary Open-Closed proof: a second connector
// is verified without editing the framework.
runSourceConnectorContractTests("JsonConnector", () => {
  const config: SourceConfig = {
    id: "payments-json",
    type: "json",
    connectionDetails: { rootPath: FIXTURES },
    filters: [{ type: "include", pattern: "*.json", field: "name" }],
    sourceAuthority: "project",
  };
  return { connector: new JsonConnector(), config };
});
