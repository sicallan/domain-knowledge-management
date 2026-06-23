import { Link } from "react-router-dom";
import type { BreadcrumbItem } from "./types";

export interface BreadcrumbProps {
  /** The traversal path; empty ⇒ the breadcrumb renders nothing. */
  trail: BreadcrumbItem[];
}

/**
 * The traversal breadcrumb (UI-3.1) — lets any persona backtrack through the graph. A
 * labelled `Breadcrumb` navigation landmark; the last crumb is `aria-current="page"`.
 */
export function Breadcrumb({ trail }: BreadcrumbProps) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="px-4 py-2 text-sm text-muted-foreground">
      <ol className="flex items-center gap-2">
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={item.id} aria-current={isLast ? "page" : undefined} className="flex items-center gap-2">
              <Link to={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
              {!isLast && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
