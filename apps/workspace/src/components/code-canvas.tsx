import * as React from "react";
import { 
  MessageSquare, 
  Check, 
  X, 
  Plus, 
  ChevronDown, 
  ChevronRight,
  FileCode,
  Copy,
  ExternalLink
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, formatRelativeTime, getInitials, copyToClipboard } from "@/lib/utils";

interface FileDiff {
  id: string;
  path: string;
  type: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

interface DiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffLine {
  id: string;
  type: 'unchanged' | 'added' | 'deleted';
  oldNumber?: number;
  newNumber?: number;
  content: string;
  comments?: Comment[];
}

interface Comment {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
    imageUrl?: string;
  };
  createdAt: Date;
  resolved: boolean;
}

interface CodeCanvasProps {
  files: FileDiff[];
  onAddComment?: (lineId: string, content: string) => void;
  onResolveComment?: (commentId: string) => void;
  onApproveChange?: (fileId: string) => void;
  onRejectChange?: (fileId: string) => void;
  className?: string;
}

export function CodeCanvas({
  files,
  onAddComment,
  onResolveComment,
  onApproveChange,
  onRejectChange,
  className,
}: CodeCanvasProps) {
  const [expandedFiles, setExpandedFiles] = React.useState<Set<string>>(
    new Set(files.map(f => f.id))
  );
  const [activeComment, setActiveComment] = React.useState<string | null>(null);

  const toggleFileExpansion = (fileId: string) => {
    const newExpanded = new Set(expandedFiles);
    if (expandedFiles.has(fileId)) {
      newExpanded.delete(fileId);
    } else {
      newExpanded.add(fileId);
    }
    setExpandedFiles(newExpanded);
  };

  const getFileTypeIcon = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return '🟦';
      case 'py':
        return '🐍';
      case 'css':
      case 'scss':
        return '🎨';
      case 'html':
        return '🌐';
      case 'json':
        return '📋';
      case 'md':
        return '📝';
      default:
        return '📄';
    }
  };

  const handleCopyContent = async (content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      // Show toast or feedback
      console.log('Copied to clipboard');
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Code Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span>{files.reduce((sum, f) => sum + f.additions, 0)} additions</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span>{files.reduce((sum, f) => sum + f.deletions, 0)} deletions</span>
            </div>
            <div className="flex items-center gap-1">
              <FileCode className="w-3 h-3" />
              <span>{files.length} files changed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      <div className="space-y-4">
        {files.map((file) => (
          <Card key={file.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleFileExpansion(file.id)}
                    className="h-6 w-6 p-0"
                    aria-label={expandedFiles.has(file.id) ? "Collapse file" : "Expand file"}
                  >
                    {expandedFiles.has(file.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-lg" role="img" aria-hidden="true">
                      {getFileTypeIcon(file.path)}
                    </span>
                    <span className="font-mono text-sm">{file.path}</span>
                  </div>
                  
                  <Badge
                    variant={
                      file.type === 'added' 
                        ? 'success' 
                        : file.type === 'deleted' 
                        ? 'destructive' 
                        : 'secondary'
                    }
                    className="text-xs"
                  >
                    {file.type}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {file.additions > 0 && (
                      <span className="text-green-600">+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-red-600">-{file.deletions}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onApproveChange?.(file.id)}
                      className="h-8 gap-1"
                      aria-label="Approve changes"
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRejectChange?.(file.id)}
                      className="h-8 gap-1"
                      aria-label="Reject changes"
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            {expandedFiles.has(file.id) && (
              <CardContent className="pt-0">
                <ScrollArea className="h-96">
                  <div className="font-mono text-sm">
                    {file.hunks.map((hunk) => (
                      <div key={hunk.id} className="mb-4">
                        {/* Hunk header */}
                        <div className="bg-muted px-3 py-2 text-xs text-muted-foreground border-y">
                          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                        </div>
                        
                        {/* Diff lines */}
                        <div className="divide-y divide-border">
                          {hunk.lines.map((line, index) => (
                            <div key={line.id} className="group relative">
                              <div
                                className={cn(
                                  "flex items-start",
                                  line.type === 'added' && "bg-green-50 dark:bg-green-900/20",
                                  line.type === 'deleted' && "bg-red-50 dark:bg-red-900/20"
                                )}
                              >
                                {/* Line numbers */}
                                <div className="flex shrink-0 select-none">
                                  <div className="w-12 px-2 py-1 text-xs text-muted-foreground text-right">
                                    {line.oldNumber}
                                  </div>
                                  <div className="w-12 px-2 py-1 text-xs text-muted-foreground text-right">
                                    {line.newNumber}
                                  </div>
                                </div>

                                {/* Change indicator */}
                                <div className="w-6 flex items-center justify-center py-1">
                                  <span
                                    className={cn(
                                      "text-xs",
                                      line.type === 'added' && "text-green-600",
                                      line.type === 'deleted' && "text-red-600"
                                    )}
                                  >
                                    {line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' '}
                                  </span>
                                </div>

                                {/* Code content */}
                                <div className="flex-1 py-1 pr-4 min-w-0">
                                  <pre className="whitespace-pre-wrap break-all">
                                    {line.content}
                                  </pre>
                                </div>

                                {/* Action buttons */}
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setActiveComment(line.id)}
                                    className="h-6 w-6 p-0"
                                    aria-label="Add comment"
                                  >
                                    <MessageSquare className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCopyContent(line.content)}
                                    className="h-6 w-6 p-0"
                                    aria-label="Copy line"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>

                              {/* Comments */}
                              {line.comments && line.comments.length > 0 && (
                                <div className="ml-24 border-l-2 border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800">
                                  {line.comments.map((comment) => (
                                    <div key={comment.id} className="p-4 border-b">
                                      <div className="flex items-start gap-3">
                                        <Avatar className="h-6 w-6">
                                          <AvatarImage src={comment.author.imageUrl} />
                                          <AvatarFallback className="text-xs">
                                            {getInitials(comment.author.name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium">
                                              {comment.author.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              {formatRelativeTime(comment.createdAt)}
                                            </span>
                                            {comment.resolved && (
                                              <Badge variant="success" className="text-xs">
                                                Resolved
                                              </Badge>
                                            )}
                                          </div>
                                          <p className="text-sm text-muted-foreground">
                                            {comment.content}
                                          </p>
                                          
                                          {!comment.resolved && (
                                            <div className="flex items-center gap-2 mt-2">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onResolveComment?.(comment.id)}
                                                className="h-6 text-xs"
                                              >
                                                <Check className="h-3 w-3 mr-1" />
                                                Resolve
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add comment form */}
                              {activeComment === line.id && (
                                <div className="ml-24 p-4 bg-muted/50 border-l-2 border-blue-200">
                                  <div className="flex items-start gap-3">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className="text-xs">
                                        You
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                      <textarea
                                        placeholder="Add a comment..."
                                        className="w-full min-h-[80px] p-2 text-sm border rounded-md resize-none focus-ring"
                                        autoFocus
                                      />
                                      <div className="flex items-center gap-2 mt-2">
                                        <Button
                                          size="sm"
                                          onClick={() => setActiveComment(null)}
                                          className="h-7"
                                        >
                                          Comment
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setActiveComment(null)}
                                          className="h-7"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}