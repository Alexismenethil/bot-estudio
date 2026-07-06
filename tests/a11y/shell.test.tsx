import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { BottomTabs } from "@/components/BottomTabs";

const items = [
  { href: "/", label: "Inicio" },
  { href: "/courses", label: "Cursos" },
  { href: "/library", label: "Biblioteca" },
];

describe("BottomTabs shell navigation (FR-028, mobile-first accessible shell)", () => {
  it("has no WCAG violations", async () => {
    const { container } = render(<BottomTabs items={items} currentPath="/" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("marks the current tab with aria-current and keeps every tab keyboard-focusable", () => {
    render(<BottomTabs items={items} currentPath="/courses" />);

    const current = screen.getByRole("link", { name: "Cursos" });
    expect(current).toHaveAttribute("aria-current", "page");

    for (const item of items) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).not.toHaveAttribute("tabindex", "-1");
    }
  });

  it("labels the navigation landmark for screen readers", () => {
    render(<BottomTabs items={items} currentPath="/" />);
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
  });
});
