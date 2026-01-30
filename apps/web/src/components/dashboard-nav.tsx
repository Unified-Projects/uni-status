"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Button,
  Skeleton,
  Badge,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@uni-status/ui";
import {
  Activity,
  Bell,
  CalendarClock,
  Code,
  FileText,
  Globe,
  Home,
  Settings,
  Users,
  ChevronDown,
  Building2,
  Plus,
  LogOut,
  Target,
  BarChart3,
  Server,
  Rocket,
  Shield,
  Mail,
  Lock,
  X,
} from "lucide-react";
import { useOrganizations } from "@/hooks/use-organizations";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { authClient } from "@uni-status/auth/client";
import { usePendingInvitations, useAcceptInvitation, useDeclineInvitation } from "@/hooks/use-invitations";
import { useSystemStatus } from "@/hooks/use-system-status";
import { useLicenseStatus, type LicenseEntitlements } from "@/hooks/use-license-status";
import { InvitationModal } from "@/components/invitations";
import type { PendingInvitation } from "@/lib/api-client";

interface DashboardNavProps {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresFeature?: keyof LicenseEntitlements;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Monitoring",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/monitors", label: "Monitors", icon: Activity },
      { href: "/certificates", label: "Certificates", icon: Shield },
      { href: "/events", label: "Events", icon: CalendarClock },
    ],
  },
  {
    label: "Reporting",
    items: [
      { href: "/status-pages", label: "Status Pages", icon: Globe },
      { href: "/slo", label: "SLO Targets", icon: Target, requiresFeature: "slo" },
      { href: "/reports", label: "Reports", icon: BarChart3, requiresFeature: "reports" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/deployments", label: "Deployments", icon: Rocket },
      { href: "/probes", label: "Probes", icon: Server },
      { href: "/oncall", label: "On-Call", icon: CalendarClock, requiresFeature: "oncall" },
      { href: "/alerts", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/team", label: "Team", icon: Users },
      { href: "/audit-logs", label: "Audit Logs", icon: FileText, requiresFeature: "auditLogs" },
      { href: "/embeds", label: "Embeds", icon: Code },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: organizations, isLoading: orgsLoading } = useOrganizations();
  const { currentOrganizationId, setCurrentOrganization } = useDashboardStore();
  const { isOpen, setOpen } = useSidebarStore();
  const { data: systemStatus } = useSystemStatus();
  const { hasFeature, getRequiredPlan } = useLicenseStatus();

  // In self-hosted mode, hide the organization switcher
  const isSelfHosted = systemStatus?.isSelfHosted ?? false;

  // Pending invitations
  const { data: pendingInvitations, isLoading: invitationsLoading } = usePendingInvitations();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();

  // Modal state
  const [selectedInvitation, setSelectedInvitation] = useState<PendingInvitation | null>(null);
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);

  // Auto-select first organization if none selected
  useEffect(() => {
    if (!currentOrganizationId && organizations && organizations.length > 0) {
      setCurrentOrganization(organizations[0].id);
    }
  }, [currentOrganizationId, organizations, setCurrentOrganization]);

  // Close sidebar on navigation (for mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  const currentOrg = organizations?.find((o) => o.id === currentOrganizationId);

  const handleInvitationClick = (invitation: PendingInvitation) => {
    setSelectedInvitation(invitation);
    setInvitationModalOpen(true);
  };

  const handleAcceptInvitation = (invitationId: string) => {
    acceptInvitation.mutate(invitationId, {
      onSuccess: (data) => {
        setInvitationModalOpen(false);
        setSelectedInvitation(null);
        // Auto-switch to the new organization
        setCurrentOrganization(data.organizationId);
        toast({
          title: "Invitation accepted",
          description: `You've joined ${data.organization.name}`,
        });
      },
      onError: (error) => {
        toast({
          title: "Failed to accept invitation",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleDeclineInvitation = (invitationId: string) => {
    declineInvitation.mutate(invitationId, {
      onSuccess: () => {
        setInvitationModalOpen(false);
        setSelectedInvitation(null);
        toast({
          title: "Invitation declined",
          description: "The invitation has been declined",
        });
      },
      onError: (error) => {
        toast({
          title: "Failed to decline invitation",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  // Shared sidebar content
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/icon.svg" alt="Uni-Status" width={32} height={32} />
          <span className="text-xl font-bold text-[#065f46] dark:text-[#34d399]">Uni-Status</span>
        </Link>
      </div>

      {/* Organization Switcher - Hidden in self-hosted mode */}
      {!isSelfHosted && (
        <div className="border-b p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between"
                disabled={orgsLoading}
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 shrink-0" />
                  {orgsLoading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    <span className="truncate">{currentOrg?.name || "Select Organisation"}</span>
                  )}
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>Organisations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {organizations?.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => setCurrentOrganization(org.id)}
                  className={cn(
                    "cursor-pointer",
                    currentOrganizationId === org.id && "bg-muted"
                  )}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {org.name}
                </DropdownMenuItem>
              ))}
              {organizations && organizations.length === 0 && (
                <DropdownMenuItem disabled>
                  No organisations found
                </DropdownMenuItem>
              )}

              {/* Pending Invitations Section */}
              {pendingInvitations && pendingInvitations.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Pending Invitations</span>
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {pendingInvitations.length}
                    </Badge>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {pendingInvitations.map((invitation) => (
                    <DropdownMenuItem
                      key={invitation.id}
                      onClick={() => handleInvitationClick(invitation)}
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="mr-2 h-4 w-4 text-primary" />
                      <span className="truncate">{invitation.organization.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organisation
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Self-hosted mode: Show organization name without switcher */}
      {isSelfHosted && currentOrg && (
        <div className="border-b p-4">
          <div className="flex items-center gap-2 px-3 py-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium truncate">{currentOrg.name}</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <TooltipProvider>
        <nav className="flex-1 overflow-y-auto p-4">
          {navGroups.map((group, groupIndex) => (
            <div key={group.label} className={cn(groupIndex > 0 && "mt-6")}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const isLocked = item.requiresFeature && !hasFeature(item.requiresFeature);
                  const requiredPlan = item.requiresFeature ? getRequiredPlan(item.requiresFeature) : null;

                  if (isLocked) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium cursor-not-allowed",
                              "text-muted-foreground/50"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="flex-1">{item.label}</span>
                            <Lock className="h-3 w-3" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Upgrade to {requiredPlan} to unlock</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </TooltipProvider>

      {/* User */}
      <div className="border-t p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-muted transition-colors">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name}
                    className="h-9 w-9 rounded-full"
                  />
                ) : (
                  user.name?.charAt(0).toUpperCase() ||
                  user.email.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 overflow-hidden text-left">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Account Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar - Fixed position, full height */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:border-r lg:bg-muted/30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-background border-r transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button for mobile */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted z-10"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent />
      </aside>

      {/* Invitation Modal */}
      <InvitationModal
        invitation={selectedInvitation}
        open={invitationModalOpen}
        onOpenChange={setInvitationModalOpen}
        onAccept={handleAcceptInvitation}
        onDecline={handleDeclineInvitation}
        isAccepting={acceptInvitation.isPending}
        isDeclining={declineInvitation.isPending}
      />
    </>
  );
}
