/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
import "vitest";

/**
 * Type augmentation for the axe matcher registered in `test/setup.ts`. vitest 2.x reads
 * matcher types from the `vitest` module's `Assertion` interface (the same channel
 * `@testing-library/jest-dom/vitest` uses), not the legacy `Vi` namespace vitest-axe ships.
 * The interfaces are deliberately empty merges, and `Assertion<T = any>` must mirror
 * vitest's own signature to declaration-merge — hence the file-level rule disables.
 */
interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
