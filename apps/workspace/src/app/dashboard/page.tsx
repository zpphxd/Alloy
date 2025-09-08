import * as React from "react";
import Link from "next/link";
import { 
  Plus, 
  Activity, 
  GitBranch, 
  Clock, 
  Users, 
  Rocket,
  TrendingUp,
  Calendar,
  ExternalLink,
  MoreHorizontal
} from "lucide-react";

import { api } from "@/lib/trpc";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime, getInitials } from "@/lib/utils";

export default function DashboardPage() {
  const { data: projects = [], isLoading: projectsLoading } = api.projects.list.useQuery();
  const { data: recentActivity = [], isLoading: activityLoading } = api.auditEvents.list.useQuery({
    limit: 10,
  });
  const { data: activeRuns = [] } = api.agents.list.useQuery({
    limit: 5,
    status: 'running',
  });

  // Mock stats - in a real app these would come from API
  const stats = {
    totalProjects: projects.length,
    activeRuns: activeRuns.length,
    pendingPRs: 3, // This would come from change requests API
    totalMembers: 12, // This would come from organization API
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Overview of your projects and recent activity
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProjects}</div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                +2 from last month
              </p>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Runs</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeRuns}</div>
              <p className="text-xs text-muted-foreground">
                Currently executing
              </p>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending PRs</CardTitle>
              <GitBranch className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingPRs}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting review
              </p>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMembers}</div>
              <p className="text-xs text-muted-foreground">
                Across all projects
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Projects Grid */}
          <Card className="card-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Projects</CardTitle>
                  <CardDescription>Your most active projects</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/projects">
                    View All
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <div className="h-10 w-10 bg-muted rounded-lg animate-pulse" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                        <div className="h-3 bg-muted/50 rounded animate-pulse w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-sm font-semibold">No projects yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Get started by creating your first project.
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/projects/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Project
                    </Link>
                  </Button>
                </div>
              ) : (
                projects.slice(0, 5).map((project) => (
                  <div key={project.id} className="flex items-center space-x-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={project.imageUrl || undefined} />
                      <AvatarFallback>
                        {getInitials(project.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium truncate hover:underline focus-ring rounded-sm"
                        >
                          {project.name}
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreHorizontal className="h-3 w-3" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Link href={`/projects/${project.id}`}>
                                View Project
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Link href={`/projects/${project.id}/settings`}>
                                Settings
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {project._count?.environments || 0} envs
                        </Badge>
                        <span>•</span>
                        <span>{formatRelativeTime(project.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="card-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest actions in your organization</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/activity">
                    View All
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start space-x-4">
                      <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                        <div className="h-3 bg-muted/50 rounded animate-pulse w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-sm font-semibold">No activity yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Activity will appear here as you use the platform.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((event) => (
                    <div key={event.id} className="flex items-start space-x-4">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={event.user?.imageUrl || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(event.user?.firstName || event.user?.emailAddress || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-1 flex-1">
                        <div className="text-sm">
                          <span className="font-medium">
                            {event.user?.firstName || event.user?.emailAddress}
                          </span>{' '}
                          <span className="text-muted-foreground">
                            {event.action}
                          </span>
                          {event.resourceType && (
                            <>
                              {' '}
                              <Badge variant="secondary" className="text-xs">
                                {event.resourceType}
                              </Badge>
                            </>
                          )}
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Clock className="mr-1 h-3 w-3" />
                          {formatRelativeTime(event.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Runs Section */}
        {activeRuns.length > 0 && (
          <Card className="card-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="h-5 w-5" />
                    Active Runs
                  </CardTitle>
                  <CardDescription>Currently executing agent runs</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/runs">View All Runs</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                      <div>
                        <div className="font-medium">{run.projectId}</div>
                        <div className="text-sm text-muted-foreground">
                          {run.prompt ? run.prompt.slice(0, 100) + '...' : 'Running...'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">
                        {run.status}
                      </Badge>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/runs/${run.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}