import { fileURLToPath } from "node:url";
import { runSourceConnectorContractTests } from "../src/contract";
import { FilesystemConnector } from "../src/index";
import type { SourceConfig } from "../src/port";

const FIXTURES = fileURLToPath(new URL("./fixtures/payments-docs", import.meta.url));

// The filesystem connector must satisfy the connector-agnostic port contract.
// Feature 06's `json` connector will call this same suite with its own harness —
// that reuse is the OCP proof.
runSourceConnectorContractTests("FilesystemConnector", () => {
  const config: SourceConfig = {
    id: "payments-docs",
    type: "filesystem",
    connectionDetails: { rootPath: FIXTURES },
    filters: [{ type: "include", pattern: "*.md", field: "name" }],
    sourceAuthority: "project",
  };
  return { connector: new FilesystemConnector(), config };
});
