import { NavLink } from "react-router-dom";
import { cn } from "../lib/cn";
import type { NavItem } from "./types";

/** The default single-persona nav (UI-3.1 §11: per-persona tailoring is additive later). */
export const DEFAULT_NAV: NavItem[] = [
  { to: "/explorer", label: "Knowledge Explorer" },
  { to: "/views/domain-map", label: "Domain Map" },
  { to: "/views/coverage", label: "Coverage Map" },
  { to: "/views/gap", label: "Gap Analysis" },
];

export interface NavMenuProps {
  items?: NavItem[];
  /** The active persona — filters items declaring a `personas` allow-list (OCP-open). */
  persona?: string;
}

/**
 * The persona-driven primary navigation (UI-3.1). New screens register by adding a
 * {@link NavItem} (OCP-open); the shell does not change. Active state reflects the route
 * via `NavLink`; the `<nav aria-label="Primary">` landmark is keyboard-navigable.
 */
export function NavMenu({ items = DEFAULT_NAV, persona }: NavMenuProps) {
  const visible = items.filter((item) => !item.personas || (persona ? item.personas.includes(persona) : false));

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {visible.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 text-sm",
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
