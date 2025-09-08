import * as React from "react";
import Link from "next/link";
import { 
  Eye, 
  ExternalLink, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Users, 
  Calendar,
  TrendingUp,
  BarChart3,
  Rocket,
  Globe
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn, formatRelativeTime, getInitials } from "@/lib/utils";

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'on-hold';
  progress: number;
  deploymentsCount: number;
  lastDeployment?: Date;
  previewUrl?: string;
  team: {
    id: string;
    name: string;
    role: string;
    imageUrl?: string;
  }[];
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  status: 'upcoming' | 'in-progress' | 'completed' | 'delayed';
  dueDate: Date;
  progress: number;
  tasks: {
    completed: number;
    total: number;
  };
}

interface StakeholderViewProps {
  projectId: string;
  className?: string;
}

export function StakeholderView({ projectId, className }: StakeholderViewProps) {
  // Mock data - in a real app this would come from API
  const projectSummary: ProjectSummary = {
    id: projectId,
    name: "E-commerce Platform Redesign",
    description: "Complete redesign of the customer-facing e-commerce platform with improved UX and performance.",
    status: 'active',
    progress: 75,
    deploymentsCount: 12,
    lastDeployment: new Date(Date.now() - 86400000), // 1 day ago
    previewUrl: "https://preview.example.com",
    team: [
      {
        id: '1',
        name: 'Alice Johnson',
        role: 'Lead Developer',
        imageUrl: undefined,
      },
      {
        id: '2',
        name: 'Bob Smith',
        role: 'Designer',
        imageUrl: undefined,
      },
      {
        id: '3',
        name: 'Carol Davis',
        role: 'Product Manager',
        imageUrl: undefined,
      },
    ],
  };

  const milestones: Milestone[] = [
    {
      id: '1',
      title: 'UI/UX Design Phase',
      description: 'Complete the visual design and user experience wireframes',
      status: 'completed',
      dueDate: new Date(Date.now() - 2592000000), // 30 days ago
      progress: 100,
      tasks: { completed: 8, total: 8 },
    },
    {
      id: '2',
      title: 'Frontend Development',
      description: 'Implement the new design with React components',
      status: 'in-progress',
      dueDate: new Date(Date.now() + 604800000), // 7 days from now
      progress: 80,
      tasks: { completed: 12, total: 15 },
    },
    {
      id: '3',
      title: 'Backend Integration',
      description: 'Connect frontend with existing APIs and services',
      status: 'upcoming',
      dueDate: new Date(Date.now() + 1209600000), // 14 days from now
      progress: 0,
      tasks: { completed: 0, total: 10 },
    },
    {
      id: '4',
      title: 'Testing & QA',
      description: 'Comprehensive testing across all devices and browsers',
      status: 'upcoming',
      dueDate: new Date(Date.now() + 1814400000), // 21 days from now
      progress: 0,
      tasks: { completed: 0, total: 6 },
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'in-progress':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'active':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'upcoming':
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
      case 'delayed':
        return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      case 'on-hold':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getMilestoneIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'in-progress':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'delayed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Project Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <CardTitle className="text-2xl">{projectSummary.name}</CardTitle>
              <CardDescription className="mt-2 max-w-2xl">
                {projectSummary.description}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(projectSummary.status)}>
                {projectSummary.status}
              </Badge>
              {projectSummary.previewUrl && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={projectSummary.previewUrl} target="_blank">
                    <Globe className="h-4 w-4 mr-2" />
                    Preview
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Overall Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">{projectSummary.progress}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${projectSummary.progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              On track for completion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Deployments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectSummary.deploymentsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {projectSummary.lastDeployment && (
                <>Last deployed {formatRelativeTime(projectSummary.lastDeployment)}</>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectSummary.team.length}</div>
            <div className="flex -space-x-2 mt-2">
              {projectSummary.team.slice(0, 3).map((member) => (
                <Avatar key={member.id} className="h-6 w-6 border-2 border-background">
                  <AvatarImage src={member.imageUrl} />
                  <AvatarFallback className="text-xs">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {projectSummary.team.length > 3 && (
                <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                  <span className="text-xs">+{projectSummary.team.length - 3}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Project Milestones
          </CardTitle>
          <CardDescription>
            Track the progress of key project phases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {milestones.map((milestone, index) => (
              <div key={milestone.id}>
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {getMilestoneIcon(milestone.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-medium">{milestone.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {milestone.description}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm text-muted-foreground shrink-0">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {milestone.dueDate.toLocaleDateString()}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {milestone.tasks.completed}/{milestone.tasks.total} tasks
                        </Badge>
                      </div>
                    </div>
                    
                    {milestone.progress > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Progress</span>
                          <span className="text-xs text-muted-foreground">{milestone.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className={cn(
                              "h-1.5 rounded-full transition-all duration-300",
                              milestone.status === 'completed' ? 'bg-green-600' :
                              milestone.status === 'in-progress' ? 'bg-blue-600' :
                              milestone.status === 'delayed' ? 'bg-red-600' : 'bg-gray-400'
                            )}
                            style={{ width: `${milestone.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {index < milestones.length - 1 && (
                  <Separator className="ml-8 mt-4" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Team Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            People working on this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projectSummary.team.map((member) => (
              <Card key={member.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={member.imageUrl} />
                    <AvatarFallback>
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-sm text-muted-foreground">{member.role}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Updates
          </CardTitle>
          <CardDescription>
            Latest project activity in non-technical terms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm">
                  <strong>Frontend components completed</strong> - All user interface elements for the shopping cart have been built and tested.
                </p>
                <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm">
                  <strong>Design review in progress</strong> - The team is reviewing the latest design mockups for the product catalog page.
                </p>
                <p className="text-xs text-muted-foreground mt-1">4 hours ago</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Rocket className="h-4 w-4 text-purple-600 mt-0.5" />
              <div>
                <p className="text-sm">
                  <strong>New preview deployed</strong> - A new version is available for testing with improved navigation and search features.
                </p>
                <p className="text-xs text-muted-foreground mt-1">1 day ago</p>
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${projectId}/activity`}>
                <Eye className="h-4 w-4 mr-2" />
                View All Updates
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}