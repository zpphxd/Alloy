import * as React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { 
  Settings, 
  Users, 
  Globe, 
  GitBranch, 
  Play, 
  Plus,
  MoreHorizontal,
  ExternalLink,
  Activity
} from "lucide-react";

import { api } from "@/lib/trpc";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StakeholderView } from "@/components/stakeholder-view";
import { CodeCanvas } from "@/components/code-canvas";
import { AgentPanel } from "@/components/agent-panel";
import { formatRelativeTime, getInitials } from "@/lib/utils";

interface ProjectPageProps {
  params: {
    id: string;
  };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const projectId = params.id;

  const { data: project, isLoading } = api.projects.get.useQuery(
    { id: projectId },
    {
      onError: (error) => {
        if (error.data?.code === 'NOT_FOUND') {
          notFound();
        }
      },
    }
  );

  const { data: environments = [] } = api.environments.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const { data: changeRequests = [] } = api.changeRequests.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  // Mock data for files and team members
  const mockFiles = [
    {
      id: '1',
      path: 'src/components/Button.tsx',
      type: 'modified' as const,
      additions: 15,
      deletions: 3,
      hunks: [
        {
          id: 'h1',
          oldStart: 1,
          oldLines: 10,
          newStart: 1,
          newLines: 22,
          lines: [
            {
              id: 'l1',
              type: 'unchanged' as const,
              oldNumber: 1,
              newNumber: 1,
              content: 'import * as React from "react";',
            },
            {
              id: 'l2',
              type: 'added' as const,
              newNumber: 2,
              content: 'import { cn } from "@/lib/utils";',
            },
            {
              id: 'l3',
              type: 'unchanged' as const,
              oldNumber: 2,
              newNumber: 3,
              content: '',
            },
          ],
        },
      ],
    },
  ];

  const mockTeamMembers = [
    {
      id: '1',
      name: 'Alice Johnson',
      role: 'Lead Developer',
      imageUrl: undefined,
      lastActive: new Date(Date.now() - 3600000),
    },
    {
      id: '2',
      name: 'Bob Smith',
      role: 'Designer',
      imageUrl: undefined,
      lastActive: new Date(Date.now() - 7200000),
    },
  ];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <div className="grid gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted/50 rounded animate-pulse" />
                </CardHeader>
                <CardContent>
                  <div className="h-12 bg-muted rounded animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    notFound();
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Project Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <p className="text-muted-foreground">
              {project.description || 'No description provided'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${project.id}/settings`}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${project.id}/activity`}>
                    <Activity className="h-4 w-4 mr-2" />
                    View Activity
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${project.id}/clone`}>
                    <GitBranch className="h-4 w-4 mr-2" />
                    Clone Project
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Environments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{environments.length}</div>
              <p className="text-xs text-muted-foreground">
                Active environments
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Change Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{changeRequests.length}</div>
              <p className="text-xs text-muted-foreground">
                Open requests
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockTeamMembers.length}</div>
              <div className="flex -space-x-2 mt-2">
                {mockTeamMembers.map((member) => (
                  <Avatar key={member.id} className="h-6 w-6 border-2 border-background">
                    <AvatarImage src={member.imageUrl} />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {formatRelativeTime(project.updatedAt)}
              </div>
              <p className="text-xs text-muted-foreground">
                Project activity
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="environments">
              Environments
              <Badge variant="secondary" className="ml-2 px-1">
                {environments.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="changes">
              Changes
              <Badge variant="secondary" className="ml-2 px-1">
                {changeRequests.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <StakeholderView projectId={project.id} />
          </TabsContent>

          <TabsContent value="environments" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Environments</h2>
                <p className="text-muted-foreground">
                  Manage your project environments and deployments
                </p>
              </div>
              <Button asChild>
                <Link href={`/projects/${project.id}/environments/new`}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Environment
                </Link>
              </Button>
            </div>

            {environments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Globe className="h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">No environments</h3>
                  <p className="text-muted-foreground text-center max-w-sm mt-2">
                    Create your first environment to start deploying your project.
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href={`/projects/${project.id}/environments/new`}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Environment
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {environments.map((env) => (
                  <Card key={env.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{env.name}</CardTitle>
                          <CardDescription>{env.description}</CardDescription>
                        </div>
                        <Badge
                          variant={env.status === 'active' ? 'success' : 'secondary'}
                        >
                          {env.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {env.url && (
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <Link
                              href={env.url}
                              target="_blank"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            >
                              {env.url}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          Updated {formatRelativeTime(env.updatedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/projects/${project.id}/environments/${env.id}`}>
                            View Details
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm">
                          <Play className="h-3 w-3 mr-1" />
                          Deploy
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="changes" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Change Requests</h2>
                <p className="text-muted-foreground">
                  Review and manage code changes
                </p>
              </div>
              <Button asChild>
                <Link href={`/projects/${project.id}/changes/new`}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Change Request
                </Link>
              </Button>
            </div>

            {changeRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <GitBranch className="h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">No change requests</h3>
                  <p className="text-muted-foreground text-center max-w-sm mt-2">
                    Create a change request to propose modifications to your project.
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href={`/projects/${project.id}/changes/new`}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Change Request
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {changeRequests.map((cr) => (
                  <Card key={cr.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>
                            <Link
                              href={`/projects/${project.id}/changes/${cr.id}`}
                              className="hover:underline"
                            >
                              {cr.title}
                            </Link>
                          </CardTitle>
                          <CardDescription>{cr.description}</CardDescription>
                        </div>
                        <Badge
                          variant={
                            cr.status === 'approved'
                              ? 'success'
                              : cr.status === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {cr.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground">
                        Created {formatRelativeTime(cr.createdAt)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="code" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Code Changes</h2>
                <p className="text-muted-foreground">
                  Review code modifications and diffs
                </p>
              </div>
            </div>
            <CodeCanvas files={mockFiles} />
          </TabsContent>

          <TabsContent value="agents" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Agent Executions</h2>
                <p className="text-muted-foreground">
                  Monitor AI agent activity and approvals
                </p>
              </div>
            </div>
            <AgentPanel />
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Team Members</h2>
                <p className="text-muted-foreground">
                  Manage project collaborators and permissions
                </p>
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {mockTeamMembers.map((member) => (
                <Card key={member.id}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.imageUrl} />
                        <AvatarFallback>
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{member.name}</CardTitle>
                        <CardDescription>{member.role}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      Last active {formatRelativeTime(member.lastActive)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}