"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, ClipboardCheck, Home, LayoutDashboard, Settings } from "lucide-react";

const items = [
  { href: "/", label: "Overzicht", icoon: LayoutDashboard },
  { href: "/verkoop", label: "Verkoop en omzet", icoon: ChartColumn },
  { href: "/waardebepalingen", label: "Waardebepalingen", icoon: ClipboardCheck },
  { href: "/woningen", label: "Woningen in verkoop", icoon: Home },
  { href: "/instellingen/doelen", label: "Doelstellingen", icoon: Settings, alleenBeheerder: true },
];

export function Navigatie({ beheerder }: { beheerder: boolean }) {
  const pad = usePathname();
  return (
    <nav aria-label="Hoofdmenu" className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:overflow-visible md:px-3 md:py-4">
      {items.filter((item) => beheerder || !item.alleenBeheerder).map(({ href, label, icoon: Icoon }) => {
        const actief = href === "/" ? pad === "/" : pad.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={actief ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-label transition-colors duration-150 ${
              actief ? "bg-primary-subtle text-primary" : "text-text-muted hover:bg-primary-subtle/50 hover:text-text"
            }`}
          >
            {actief && <span aria-hidden className="absolute inset-y-1 left-0 hidden w-[3px] rounded-full bg-primary md:block" />}
            <Icoon aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
