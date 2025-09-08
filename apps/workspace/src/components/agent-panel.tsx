import * as React from "react";
import { 
  Bot, 
  Play, 
  Pause, 
  Square, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Zap,
  FileText,
  Terminal,
  Eye,
  Download,
  RefreshCw
} from "lucide-react";

import { api, type AgentExecution } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatRelativeTime } from "@/lib/utils";

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  data?: any;
}

interface Artifact {
  id: string;
  name: string;
  type: 'file' | 'output' | 'image' | 'json';
  size: number;
  url?: string;
  content?: string;
  createdAt: Date;
}

interface AgentPanelProps {
  executionId?: string;
  onApprove?: (stepId: string) => void;
  onReject?: (stepId: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  className?: string;
}

export function AgentPanel({
  executionId,
  onApprove,
  onReject,
  onPause,
  onResume,
  onStop,
  className,
}: AgentPanelProps) {
  const [selectedTab, setSelectedTab] = React.useState("logs");
  const [autoScroll, setAutoScroll] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Get execution details
  const { data: execution, isLoading } = api.agents.get.useQuery(
    { id: executionId! },
    { enabled: !!executionId }
  );

  // Mock data for logs and artifacts
  const mockLogs: LogEntry[] = [
    {
      id: '1',
      timestamp: new Date(Date.now() - 5000),
      level: 'info',
      message: 'Agent execution started',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 4000),
      level: 'info',
      message: 'Analyzing project structure...',
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 3000),
      level: 'warning',
      message: 'Found 3 files that need updating',
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 2000),
      level: 'info',
      message: 'Generating code changes for src/components/Button.tsx',
    },
    {
      id: '5',
      timestamp: new Date(Date.now() - 1000),
      level: 'info',
      message: 'Waiting for approval on file modifications...',
    },
  ];

  const mockArtifacts: Artifact[] = [
    {
      id: '1',
      name: 'Button.tsx',
      type: 'file',
      size: 2048,
      createdAt: new Date(Date.now() - 2000),
    },
    {
      id: '2',
      name: 'execution-summary.json',
      type: 'json',
      size: 512,
      content: JSON.stringify({ changes: 3, files: ['Button.tsx', 'Input.tsx'] }),
      createdAt: new Date(Date.now() - 1500),
    },
    {
      id: '3',
      name: 'test-results.txt',
      type: 'output',
      size: 1024,
      createdAt: new Date(Date.now() - 1000),
    },
  ];

  // Auto-scroll to bottom when new logs arrive
  React.useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mockLogs, autoScroll]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-500" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'running':
        return 'default';
      case 'paused':
        return 'warning';
      case 'completed':
        return 'success';
      case 'failed':
        return 'destructive';
      case 'pending':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="h-3 w-3 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-3 w-3 text-yellow-500" />;
      case 'info':
        return <CheckCircle className="h-3 w-3 text-blue-500" />;
      case 'debug':
        return <Terminal className="h-3 w-3 text-gray-500" />;
      default:
        return <CheckCircle className="h-3 w-3" />;
    }
  };

  const getFileTypeIcon = (type: string) => {
    switch (type) {
      case 'file':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'output':
        return <Terminal className="h-4 w-4 text-green-500" />;
      case 'image':
        return <Eye className="h-4 w-4 text-purple-500" />;
      case 'json':
        return <FileText className="h-4 w-4 text-orange-500" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 animate-spin" />
            Loading Agent...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Execution
            {execution && (
              <Badge variant={getStatusBadgeVariant(execution.status)} className="ml-2">
                <span className="flex items-center gap-1">
                  {getStatusIcon(execution.status)}
                  {execution.status}
                </span>
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-8"
              aria-label={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
            >
              <RefreshCw className={cn("h-3 w-3", autoScroll && "animate-spin")} />
            </Button>

            {execution?.status === 'running' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPause}
                  className="h-8 gap-1"
                  aria-label="Pause execution"
                >
                  <Pause className="h-3 w-3" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStop}
                  className="h-8 gap-1 text-red-600 hover:text-red-700"
                  aria-label="Stop execution"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </Button>
              </>
            )}

            {execution?.status === 'paused' && (
              <Button
                variant="default"
                size="sm"
                onClick={onResume}
                className="h-8 gap-1"
                aria-label="Resume execution"
              >
                <Play className="h-3 w-3" />
                Resume
              </Button>
            )}
          </div>
        </div>

        {execution && (
          <div className="text-sm text-muted-foreground">
            {execution.prompt && (
              <div className="truncate">
                <strong>Task:</strong> {execution.prompt}
              </div>
            )}
            <div>
              Started {formatRelativeTime(execution.createdAt)}
              {execution.completedAt && (
                <> • Completed {formatRelativeTime(execution.completedAt)}</>
              )}
            </div>
          </div>
        )}
      </CardHeader>

      <Separator />

      <div className="flex-1 overflow-hidden">
        <Tabs 
          value={selectedTab} 
          onValueChange={setSelectedTab}
          className="h-full flex flex-col"
        >
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="logs" className="gap-2">
                <Terminal className="h-4 w-4" />
                Logs
              </TabsTrigger>
              <TabsTrigger value="artifacts" className="gap-2">
                <FileText className="h-4 w-4" />
                Artifacts
                <Badge variant="secondary" className="text-xs px-1">
                  {mockArtifacts.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="approval" className="gap-2">
                <Zap className="h-4 w-4" />
                Approval
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="logs" className="h-full mt-0">
              <ScrollArea className="h-full px-6">
                <div ref={scrollRef} className="space-y-2 py-4">
                  {mockLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 py-2">
                      <div className="mt-0.5">
                        {getLogLevelIcon(log.level)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <span>{log.timestamp.toLocaleTimeString()}</span>
                          <Badge variant="outline" className="text-xs px-1">
                            {log.level}
                          </Badge>
                        </div>
                        <p className="text-sm">{log.message}</p>
                        {log.data && (
                          <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="artifacts" className="h-full mt-0">
              <ScrollArea className="h-full px-6">
                <div className="space-y-3 py-4">
                  {mockArtifacts.map((artifact) => (
                    <Card key={artifact.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getFileTypeIcon(artifact.type)}
                          <div>
                            <div className="font-medium text-sm">{artifact.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {artifact.size} bytes • {formatRelativeTime(artifact.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="h-8">
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button variant="outline" size="sm" className="h-8">
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="approval" className="h-full mt-0">
              <ScrollArea className="h-full px-6">
                <div className="space-y-4 py-4">
                  {execution?.status === 'running' && (
                    <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/10">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-medium text-sm mb-2">
                            Approval Required
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            The agent wants to modify 3 files in your project. Review the changes and approve or reject them.
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => onApprove?.('step-1')}
                              className="gap-2"
                              aria-label="Approve changes"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Approve All
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onReject?.('step-1')}
                              className="gap-2"
                              aria-label="Reject changes"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2"
                              aria-label="Review changes"
                            >
                              <Eye className="h-3 w-3" />
                              Review Changes
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}

                  {execution?.status === 'pending' && (
                    <div className="text-center py-8">
                      <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <h3 className="mt-4 text-sm font-semibold">Waiting for Agent</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        The agent hasn't requested any approvals yet.
                      </p>
                    </div>
                  )}

                  {execution?.status === 'completed' && (
                    <div className="text-center py-8">
                      <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                      <h3 className="mt-4 text-sm font-semibold">Execution Complete</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        All changes have been applied successfully.
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </Card>
  );
}