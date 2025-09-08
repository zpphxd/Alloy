import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  FolderOpen, 
  GitBranch, 
  Play, 
  Settings, 
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface NavigationItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const mainNavigation: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: BarChart3,
  },
  {
    href: "/projects",
    label: "Projects",
    icon: FolderOpen,
  },
  {
    href: "/environments",
    label: "Environments",
    icon: Settings,
  },
  {
    href: "/change-requests",
    label: "Pull Requests",
    icon: GitBranch,
  },
  {
    href: "/runs",
    label: "Runs",
    icon: Play,
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div
      className={cn(
        "flex flex-col border-r bg-background transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64",
        className
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!collapsed && (
          <Link 
            href="/dashboard" 
            className="flex items-center gap-2 text-lg font-semibold focus-ring rounded-md p-1"
            aria-label="Go to dashboard"
          >
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm" aria-hidden="true">
                A
              </span>
            </div>
            <span>Alloy</span>
          </Link>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto shrink-0"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4" role="menubar">
        <ul className="space-y-2" role="none">
          {mainNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <li key={item.href} role="none">
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground focus-ring",
                    isActive 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  role="menuitem"
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon 
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive && "text-accent-foreground"
                    )} 
                    aria-hidden="true"
                  />
                  {!collapsed && (
                    <>
                      <span>{item.label}</span>
                      {item.badge && (
                        <span 
                          className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                          aria-label={`${item.badge} items`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Separator />

      {/* Secondary Navigation */}
      <div className="p-4">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground focus-ring",
            pathname === "/settings" 
              ? "bg-accent text-accent-foreground" 
              : "text-muted-foreground",
            collapsed && "justify-center px-2"
          )}
          role="menuitem"
          title={collapsed ? "Settings" : undefined}
        >
          <Settings 
            className={cn(
              "h-4 w-4 shrink-0",
              pathname === "/settings" && "text-accent-foreground"
            )}
            aria-hidden="true"
          />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
    </div>
  );
}