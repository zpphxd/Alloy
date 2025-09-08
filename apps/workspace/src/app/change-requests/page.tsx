import * as React from "react";
import Link from "next/link";
import { 
  GitBranch, 
  Plus, 
  CheckCircle, 
  XCircle, 
  Clock, 
  MessageSquare,
  Filter,
  Search
} from "lucide-react";

import { api } from "@/lib/trpc";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatRelativeTime, getInitials } from "@/lib/utils";

export default function ChangeRequestsPage() {
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const { data: changeRequests = [], isLoading } = api.changeRequests.list.useQuery();

  const filteredRequests = changeRequests.filter((cr) => {
    if (statusFilter === 'all') return true;
    return cr.status === statusFilter;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <GitBranch className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'destructive';
      case 'pending':
        return 'warning';
      case 'draft':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const statusCounts = {
    all: changeRequests.length,
    pending: changeRequests.filter(cr => cr.status === 'pending').length,
    approved: changeRequests.filter(cr => cr.status === 'approved').length,
    rejected: changeRequests.filter(cr => cr.status === 'rejected').length,
    draft: changeRequests.filter(cr => cr.status === 'draft').length,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pull Requests</h1>
            <p className="text-muted-foreground">
              Review and manage code changes across all projects
            </p>
          </div>
          <Button asChild>
            <Link href="/change-requests/new">
              <Plus className="h-4 w-4 mr-2" />
              New Pull Request
            </Link>
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statusCounts.all}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {statusCounts.pending}
              </div>
              <p className="text-xs text-muted-foreground">Needs attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {statusCounts.approved}
              </div>
              <p className="text-xs text-muted-foreground">Ready to merge</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">
                {statusCounts.draft}
              </div>
              <p className="text-xs text-muted-foreground">Work in progress</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Tabs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    placeholder="Search pull requests..."
                    className="pl-8 pr-4 py-2 w-64 text-sm border border-input rounded-md focus-ring"
                  />
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                      All ({statusCounts.all})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter('pending')}>
                      Pending ({statusCounts.pending})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter('approved')}>
                      Approved ({statusCounts.approved})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter('rejected')}>
                      Rejected ({statusCounts.rejected})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter('draft')}>
                      Drafts ({statusCounts.draft})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              <div className="text-sm text-muted-foreground">
                Showing {filteredRequests.length} of {changeRequests.length} requests
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Change Requests List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-3 bg-muted/50 rounded animate-pulse w-2/3" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-4">
                      <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                      <div className="space-y-1 flex-1">
                        <div className="h-3 bg-muted rounded animate-pulse" />
                        <div className="h-3 bg-muted/50 rounded animate-pulse w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <GitBranch className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">
                  {statusFilter === 'all' ? 'No pull requests' : `No ${statusFilter} requests`}
                </h3>
                <p className="text-muted-foreground text-center max-w-sm mt-2">
                  {statusFilter === 'all' 
                    ? 'Get started by creating your first pull request.'
                    : `There are no ${statusFilter} pull requests at the moment.`
                  }
                </p>
                {statusFilter === 'all' && (
                  <Button className="mt-4" asChild>
                    <Link href="/change-requests/new">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Pull Request
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredRequests.map((changeRequest) => (
              <Card key={changeRequest.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-1">
                        {getStatusIcon(changeRequest.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-lg">
                          <Link
                            href={`/change-requests/${changeRequest.id}`}
                            className="hover:underline focus-ring rounded-sm"
                          >
                            {changeRequest.title}
                          </Link>
                        </CardTitle>
                        {changeRequest.description && (
                          <CardDescription className="mt-1 line-clamp-2">
                            {changeRequest.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(changeRequest.status)}>
                      {changeRequest.status}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {/* Project info */}
                      <div className="flex items-center gap-1">
                        <span>Project:</span>
                        <Link
                          href={`/projects/${changeRequest.projectId}`}
                          className="text-foreground hover:underline font-medium"
                        >
                          Project {changeRequest.projectId.slice(0, 8)}
                        </Link>
                      </div>

                      <Separator orientation="vertical" className="h-4" />

                      {/* Created info */}
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={changeRequest.createdBy?.imageUrl} />
                          <AvatarFallback className="text-xs">
                            {getInitials(
                              changeRequest.createdBy?.firstName || 
                              changeRequest.createdBy?.emailAddress || 
                              'U'
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          opened {formatRelativeTime(changeRequest.createdAt)} by{' '}
                          <span className="font-medium">
                            {changeRequest.createdBy?.firstName || 
                             changeRequest.createdBy?.emailAddress}
                          </span>
                        </span>
                      </div>

                      {/* Comments count */}
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        <span>0</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {changeRequest.status === 'pending' && (
                        <>
                          <Button variant="outline" size="sm">
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                          <Button size="sm">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                        </>
                      )}
                      
                      {changeRequest.status === 'approved' && (
                        <Button size="sm" variant="success">
                          Merge
                        </Button>
                      )}
                      
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/change-requests/${changeRequest.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}