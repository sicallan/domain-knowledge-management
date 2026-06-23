import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** The MSW node server (tests) — intercepts the urql fetch and runs the gateway schema. */
export const mockServer = setupServer(...handlers);
