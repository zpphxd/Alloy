import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";

import { api, type Organization } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";

export function OrganizationSwitcher() {
  const { user } = useUser();
  const [selectedOrgId, setSelectedOrgId] = React.useState<string | null>(null);

  // Get organizations for the current user
  const { data: organizations = [], isLoading } = api.organizations.list.useQuery(
    undefined,
    {
      enabled: !!user,
    }
  );

  // Set initial selected organization
  React.useEffect(() => {
    if (organizations.length > 0 && !selectedOrgId) {
      // Try to get from localStorage first
      const savedOrgId = localStorage.getItem("alloy-selected-org");
      const validSavedOrg = organizations.find(org => org.id === savedOrgId);
      
      if (validSavedOrg) {
        setSelectedOrgId(validSavedOrg.id);
      } else {
        // Default to first organization
        setSelectedOrgId(organizations[0].id);
      }
    }
  }, [organizations, selectedOrgId]);

  // Save selected organization to localStorage
  React.useEffect(() => {
    if (selectedOrgId) {
      localStorage.setItem("alloy-selected-org", selectedOrgId);
    }
  }, [selectedOrgId]);

  const selectedOrg = organizations.find(org => org.id === selectedOrgId);

  const handleSelectOrg = (orgId: string) => {
    setSelectedOrgId(orgId);
  };

  const handleCreateOrg = () => {
    // In a real app, this would open a modal or navigate to create org page
    console.log("Create new organization");
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!selectedOrg && organizations.length === 0) {
    return (
      <Button
        variant="outline"
        onClick={handleCreateOrg}
        className="gap-2"
        aria-label="Create organization"
      >
        <Plus className="h-4 w-4" />
        Create Organization
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-64 justify-between"
          aria-expanded="false"
          aria-label={`Current organization: ${selectedOrg?.name || 'Select organization'}`}
        >
          {selectedOrg ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage 
                  src={selectedOrg.imageUrl || undefined} 
                  alt={`${selectedOrg.name} logo`}
                />
                <AvatarFallback className="text-xs">
                  {getInitials(selectedOrg.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium truncate max-w-32">
                  {selectedOrg.name}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>Select organization</span>
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => handleSelectOrg(org.id)}
            className="flex items-center gap-2 p-2"
            aria-label={`Switch to ${org.name}`}
          >
            <Avatar className="h-6 w-6">
              <AvatarImage 
                src={org.imageUrl || undefined} 
                alt={`${org.name} logo`}
              />
              <AvatarFallback className="text-xs">
                {getInitials(org.name)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex flex-col items-start flex-1 min-w-0">
              <span className="text-sm font-medium truncate max-w-40">
                {org.name}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs px-1">
                  {org._count?.members || 0} members
                </Badge>
                {org.plan && (
                  <Badge variant="outline" className="text-xs px-1">
                    {org.plan}
                  </Badge>
                )}
              </div>
            </div>
            
            {selectedOrgId === org.id && (
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onSelect={handleCreateOrg}
          className="gap-2"
          aria-label="Create new organization"
        >
          <Plus className="h-4 w-4" />
          Create Organization
        </DropdownMenuItem>
        
        <DropdownMenuItem
          onSelect={() => {
            // Navigate to organization management
            console.log("Manage organizations");
          }}
          className="gap-2"
          aria-label="Manage organizations"
        >
          <Building2 className="h-4 w-4" />
          Manage Organizations
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}