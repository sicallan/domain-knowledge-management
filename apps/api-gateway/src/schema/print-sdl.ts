import { sdl } from "./sdl";

// `pnpm --filter @dkm/api-gateway print-sdl` — emit the contract for codegen / review.
process.stdout.write(`${sdl}\n`);
