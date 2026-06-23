import type { NotificationItem } from "./types";

/**
 * Static notification-centre scaffold (UI-3.1). Clearly placeholder content — live event
 * delivery is Phase 5. Kept out of components so the shell renders no hand-rolled fixtures
 * inline (UI-D2).
 */
export const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n-welcome",
    title: "Welcome to the Knowledge Studio",
    detail: "Live notifications arrive in Phase 5.",
    level: "info",
    at: "2026-06-22T00:00:00Z",
  },
];
