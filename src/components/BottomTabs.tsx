export interface BottomTabItem {
  href: string;
  label: string;
}

export interface BottomTabsProps {
  items: BottomTabItem[];
  currentPath: string;
}

// Mobile-first bottom navigation (FR-028, constitution Principle VI).
export function BottomTabs({ items, currentPath }: BottomTabsProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 flex justify-around border-t bg-white dark:bg-neutral-900"
    >
      {items.map((item) => {
        const isCurrent = item.href === currentPath;
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            className="flex-1 py-2 text-center text-sm"
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
