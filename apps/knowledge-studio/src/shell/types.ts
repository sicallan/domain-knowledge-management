/** A node in the breadcrumb traversal trail (UI-3.1 §7). */
export interface BreadcrumbItem {
  id: string;
  label: string;
  href: string;
}

/** A notification-centre item (static scaffold now; live events are Phase 5). */
export interface NotificationItem {
  id: string;
  title: string;
  detail?: string;
  level: "info" | "warning" | "error";
  at: string;
}

/** A primary-nav entry (persona-driven; one default persona in Phase 3). */
export interface NavItem {
  to: string;
  label: string;
  /** Personas this entry is shown to; omitted ⇒ all personas (OCP-open). */
  personas?: string[];
}
