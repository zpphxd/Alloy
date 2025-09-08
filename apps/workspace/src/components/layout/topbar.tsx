import * as React from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { GitBranch, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { OrganizationSwitcher } from "@/components/org-switcher";

interface TopbarProps {
  className?: string;
}

export function Topbar({ className }: TopbarProps) {
  const { user } = useUser();

  // Mock user role - in real app this would come from your user data
  const userRole = user?.publicMetadata?.role as string || "Developer";

  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "destructive";
      case "manager":
        return "warning";
      case "developer":
        return "default";
      case "viewer":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <header 
      className="flex h-16 items-center justify-between border-b bg-background px-6"
      role="banner"
    >
      {/* Left side - Organization Switcher */}
      <div className="flex items-center gap-4">
        <OrganizationSwitcher />
        
        {user && (
          <Badge 
            variant={getRoleBadgeVariant(userRole)}
            className="hidden sm:inline-flex"
          >
            {userRole}
          </Badge>
        )}
      </div>

      {/* Right side - Actions and User */}
      <div className="flex items-center gap-4">
        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="gap-2"
            aria-label="Open new pull request"
          >
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Open PR
          </Button>
          
          <Button 
            variant="default" 
            size="sm"
            className="gap-2"
            aria-label="Deploy preview"
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            Deploy Preview
          </Button>
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Button */}
        <div className="relative">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
                userButtonPopoverCard: "shadow-lg border",
                userButtonPopoverActionButton: "hover:bg-accent",
              },
            }}
            showName={false}
            userProfileMode="navigation"
            userProfileUrl="/settings/profile"
          />
        </div>
      </div>
    </header>
  );
}