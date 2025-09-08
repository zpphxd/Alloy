import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { 
  Users, 
  Shield, 
  Building2, 
  CreditCard, 
  Key, 
  Bell,
  Plus,
  MoreHorizontal,
  Crown,
  UserCheck,
  UserX,
  Mail
} from "lucide-react";

import { api } from "@/lib/trpc";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatRelativeTime, getInitials } from "@/lib/utils";

export default function SettingsPage() {
  const { user } = useUser();

  // Mock team members data - in real app this would come from API
  const mockTeamMembers = [
    {
      id: '1',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'Owner',
      status: 'active',
      imageUrl: undefined,
      lastActive: new Date(Date.now() - 3600000),
      joinedAt: new Date(Date.now() - 30 * 24 * 3600000),
    },
    {
      id: '2',
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'Admin',
      status: 'active',
      imageUrl: undefined,
      lastActive: new Date(Date.now() - 7200000),
      joinedAt: new Date(Date.now() - 20 * 24 * 3600000),
    },
    {
      id: '3',
      name: 'Carol Davis',
      email: 'carol@example.com',
      role: 'Developer',
      status: 'active',
      imageUrl: undefined,
      lastActive: new Date(Date.now() - 86400000),
      joinedAt: new Date(Date.now() - 10 * 24 * 3600000),
    },
    {
      id: '4',
      name: 'David Wilson',
      email: 'david@example.com',
      role: 'Viewer',
      status: 'pending',
      imageUrl: undefined,
      lastActive: null,
      joinedAt: new Date(Date.now() - 1 * 24 * 3600000),
    },
  ];

  const mockApiKeys = [
    {
      id: '1',
      name: 'Production API Key',
      prefix: 'ak_prod_****',
      createdAt: new Date(Date.now() - 15 * 24 * 3600000),
      lastUsed: new Date(Date.now() - 3600000),
      scopes: ['read', 'write'],
    },
    {
      id: '2',
      name: 'CI/CD Pipeline',
      prefix: 'ak_cicd_****',
      createdAt: new Date(Date.now() - 7 * 24 * 3600000),
      lastUsed: new Date(Date.now() - 1800000),
      scopes: ['read'],
    },
  ];

  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner':
        return 'destructive';
      case 'admin':
        return 'warning';
      case 'developer':
        return 'default';
      case 'viewer':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner':
        return <Crown className="h-3 w-3" />;
      case 'admin':
        return <Shield className="h-3 w-3" />;
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Manage your organization settings and team
            </p>
          </div>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="team" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="team" className="gap-2">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
            <TabsTrigger value="organization" className="gap-2">
              <Building2 className="h-4 w-4" />
              Organization
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* Team Management */}
          <TabsContent value="team" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Team Members</h2>
                <p className="text-muted-foreground">
                  Manage who has access to your organization
                </p>
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {mockTeamMembers.map((member, index) => (
                    <div key={member.id} className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.imageUrl} />
                          <AvatarFallback>
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{member.name}</h3>
                            <Badge variant={getRoleBadgeVariant(member.role)} className="gap-1">
                              {getRoleIcon(member.role)}
                              {member.role}
                            </Badge>
                            {member.status === 'pending' && (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {member.email}
                            </div>
                            <span>•</span>
                            <div>
                              {member.status === 'pending'
                                ? `Invited ${formatRelativeTime(member.joinedAt)}`
                                : member.lastActive
                                ? `Active ${formatRelativeTime(member.lastActive)}`
                                : 'Never signed in'
                              }
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {member.status === 'pending' && (
                          <>
                            <Button variant="outline" size="sm">
                              <Mail className="h-3 w-3 mr-1" />
                              Resend
                            </Button>
                            <Button variant="outline" size="sm">
                              <UserX className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          </>
                        )}
                        
                        {member.status === 'active' && member.role !== 'Owner' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">More options</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>Change Role</DropdownMenuItem>
                              <DropdownMenuItem>Send Message</DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">
                                Remove from Team
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Role Permissions */}
            <Card>
              <CardHeader>
                <CardTitle>Role Permissions</CardTitle>
                <CardDescription>
                  Understanding what each role can do in your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="gap-1">
                        <Crown className="h-3 w-3" />
                        Owner
                      </Badge>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• Full access to all features</li>
                      <li>• Manage billing and subscription</li>
                      <li>• Delete organization</li>
                      <li>• Manage team members</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="warning" className="gap-1">
                        <Shield className="h-3 w-3" />
                        Admin
                      </Badge>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• Manage team members</li>
                      <li>• Create and delete projects</li>
                      <li>• Manage organization settings</li>
                      <li>• View all projects</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <Badge variant="default">Developer</Badge>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• Create and manage own projects</li>
                      <li>• Submit change requests</li>
                      <li>• Access assigned projects</li>
                      <li>• Run agent executions</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <Badge variant="secondary">Viewer</Badge>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• View assigned projects</li>
                      <li>• View change requests</li>
                      <li>• Access stakeholder views</li>
                      <li>• Read-only access</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Organization Settings */}
          <TabsContent value="organization" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Organization Settings</h2>
              <p className="text-muted-foreground">
                Manage your organization information and preferences
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Organization Profile</CardTitle>
                <CardDescription>
                  Update your organization's public information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Organization Name</label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    className="mt-1 w-full px-3 py-2 border border-input rounded-md focus-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    placeholder="What does your organization do?"
                    rows={3}
                    className="mt-1 w-full px-3 py-2 border border-input rounded-md focus-ring resize-none"
                  />
                </div>
                <Button>Save Changes</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Security & Authentication</h2>
              <p className="text-muted-foreground">
                Configure security settings for your organization
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Authentication Settings</CardTitle>
                <CardDescription>
                  Control how team members authenticate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Require two-factor authentication</h4>
                    <p className="text-sm text-muted-foreground">
                      All team members must enable 2FA to access the organization
                    </p>
                  </div>
                  <Switch />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Single Sign-On (SSO)</h4>
                    <p className="text-sm text-muted-foreground">
                      Allow team members to sign in with your company SSO
                    </p>
                  </div>
                  <Button variant="outline">Configure SSO</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys */}
          <TabsContent value="api" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">API Keys</h2>
                <p className="text-muted-foreground">
                  Manage API keys for programmatic access
                </p>
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create API Key
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {mockApiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="p-6 flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{apiKey.name}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="font-mono">{apiKey.prefix}</span>
                          <span>•</span>
                          <span>Created {formatRelativeTime(apiKey.createdAt)}</span>
                          <span>•</span>
                          <span>Last used {formatRelativeTime(apiKey.lastUsed)}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {apiKey.scopes.map((scope) => (
                            <Badge key={scope} variant="outline" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">More options</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Edit Scopes</DropdownMenuItem>
                            <DropdownMenuItem>Regenerate</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">
                              Revoke
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Notification Preferences</h2>
              <p className="text-muted-foreground">
                Control when and how you receive notifications
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>
                  Choose what email notifications you'd like to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Change request updates</h4>
                    <p className="text-sm text-muted-foreground">
                      Get notified when change requests are created or updated
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Agent execution alerts</h4>
                    <p className="text-sm text-muted-foreground">
                      Receive alerts when agents require approval or fail
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Team member activity</h4>
                    <p className="text-sm text-muted-foreground">
                      Get notified when team members join or leave
                    </p>
                  </div>
                  <Switch />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Weekly digest</h4>
                    <p className="text-sm text-muted-foreground">
                      Receive a weekly summary of organization activity
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}