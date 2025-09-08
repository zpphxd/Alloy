import * as React from "react";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function AppLayout({ children, className }: AppLayoutProps) {
  return (
    <>
      <SignedIn>
        <div className="min-h-screen bg-background">
          <div className="flex">
            {/* Sidebar */}
            <Sidebar />
            
            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
              <Topbar />
              
              <main 
                className={cn("flex-1 p-6", className)}
                role="main"
                id="main-content"
              >
                {children}
              </main>
            </div>
          </div>
        </div>
      </SignedIn>
      
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}