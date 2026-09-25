"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, Building2, Cog, Globe, LayoutDashboard, LayoutTemplate, Mail, Megaphone, RefreshCw, ShieldBan, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/leads", label: "Leads", icon: Building2 },
  { href: "/previews", label: "Previews", icon: Globe },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/followups", label: "Follow-ups", icon: RefreshCw },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/suppression", label: "Suppression List", icon: ShieldBan },
  { href: "/settings", label: "Settings", icon: Cog },
  { href: "/jobs", label: "System Jobs", icon: Activity },
];

export function Sidebar({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 px-5">
        <div className="grid size-7 place-items-center rounded-md bg-[var(--primary)] text-xs font-bold text-white">LG</div>
        <span className="text-sm font-semibold text-white">Lead Generator</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-active hover:text-white",
                active && "bg-sidebar-active text-white",
              )}
            >
              <Icon className="size-4 opacity-80" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
            <Users className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{user.name}</p>
            <p className="truncate text-xs">{user.role}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="post" className="mt-3">
          <button className="w-full rounded-md px-3 py-1.5 text-left text-xs hover:bg-sidebar-active hover:text-white">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
