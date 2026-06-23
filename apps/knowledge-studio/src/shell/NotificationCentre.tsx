import { useState } from "react";
import type { NotificationItem } from "./types";

export interface NotificationCentreProps {
  /** The notification list (a static scaffold now; live delivery is Phase 5 WebSocket). */
  items: NotificationItem[];
}

/**
 * The notification centre (UI-3.1) — a static list scaffold. The toggle button exposes a
 * count and `aria-expanded`/`aria-controls`; live event delivery lands in Phase 5. New
 * notification item types are additive (OCP-open).
 */
export function NotificationCentre({ items }: NotificationCentreProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? "notification-list" : undefined}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-border px-3 py-1.5 text-sm"
      >
        Notifications
        <span className="ml-1 rounded-full bg-muted px-1.5 text-xs" aria-label={`${items.length} notifications`}>
          {items.length}
        </span>
      </button>
      {open && (
        <ul
          id="notification-list"
          aria-label="Notifications"
          className="absolute right-0 mt-1 w-72 rounded-md border border-border bg-background p-2 text-sm shadow"
        >
          {items.length === 0 ? (
            <li className="text-muted-foreground">No notifications</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="border-b border-border py-1 last:border-0">
                <span className="font-medium">{item.title}</span>
                {item.detail && <span className="block text-muted-foreground">{item.detail}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
