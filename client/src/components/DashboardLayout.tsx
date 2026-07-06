import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
  UserCircle,
  Building2,
  Target,
  Activity,
  Package,
  ArrowLeftRight,
  ShoppingCart,
  Layers,
  FileText,
  BarChart3,
  Settings,
  Truck,
  FolderKanban,
  Zap,
  Wrench,
  ArrowRightLeft,
  ClipboardList,
  Wallet,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const menuSections = [
  {
    title: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: BarChart3, label: "Analytics", path: "/analytics" },
    ],
  },
  {
    title: "CRM",
    items: [
      { icon: Target, label: "Leads", path: "/leads" },
      { icon: UserCircle, label: "Contacts", path: "/contacts" },
      { icon: Building2, label: "Accounts", path: "/accounts" },
      { icon: Layers, label: "Opportunities", path: "/opportunities" },
      { icon: Activity, label: "Activities", path: "/activities" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { icon: Package, label: "Items", path: "/inventory" },
      { icon: ArrowLeftRight, label: "Stock Transactions", path: "/stock-transactions" },
      { icon: ArrowRightLeft, label: "Transfers", path: "/warehouse-transfers" },
      { icon: Wrench, label: "Adjustments", path: "/stock-adjustments" },
      { icon: Truck, label: "Suppliers", path: "/suppliers" },
      { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders" },
      { icon: Layers, label: "BOM Packages", path: "/bom-packages" },
      { icon: ClipboardList, label: "Audit Trail", path: "/inventory-audit" },
    ],
  },
  {
    title: "Projects",
    items: [
      { icon: FolderKanban, label: "Project Monitoring", path: "/projects" },
      { icon: Wallet, label: "Project Payments", path: "/project-payments" },
      { icon: Zap, label: "Net Metering", path: "/net-metering" },
      { icon: Zap, label: "NM Payments", path: "/nm-payments" },
    ],
  },
  {
    title: "Sales",
    items: [
      { icon: FileText, label: "Quotations", path: "/quotations" },
      { icon: FileText, label: "Special Quotations", path: "/special-quotations" },
    ],
  },
  {
    title: "Admin",
    items: [
      { icon: Users, label: "User Management", path: "/users" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
];

const allMenuItems = menuSections.flatMap((s) => s.items);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    // Redirect to local login page
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <img
              src="/images/jmc-solar-logo.png"
              alt="JMC Solar"
              className="h-12 object-contain"
            />
            <h1 className="text-2xl font-semibold tracking-tight text-center text-foreground">
              Redirecting to login...
            </h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = allMenuItems.find((item) => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  // Role-based menu visibility
  const userRole = user?.role;
  const isLimitedRole = ["purchaser", "staff", "sales_rep"].includes(userRole || "");
  const visibleSections = menuSections.filter((section) => {
    // Limited roles (purchaser, staff, sales_rep) only see Inventory
    if (isLimitedRole) {
      return section.title === "Inventory";
    }
    // Admin section only visible to admin and subadmin
    if (section.title === "Admin" && userRole !== "admin" && userRole !== "subadmin") return false;
    // SubAdmin can see User Management but not Settings
    return true;
  }).map((section) => {
    if (isLimitedRole && section.title === "Inventory") {
      // Limited roles: only Items, Stock Transactions, Transfers, Suppliers, Purchase Orders
      return {
        ...section,
        items: section.items.filter((item) =>
          ["/inventory", "/stock-transactions", "/warehouse-transfers", "/suppliers", "/purchase-orders"].includes(item.path)
        ),
      };
    }
    // SubAdmin: show User Management in Admin section
    if (section.title === "Admin" && userRole === "subadmin") {
      return {
        ...section,
        items: section.items.filter((item) => item.path === "/users"),
      };
    }
    return section;
  });

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0">
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src="/images/jmc-solar-logo.png"
                    alt="JMC Solar"
                    className="h-7 object-contain"
                  />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            {visibleSections.map((section) => (
              <div key={section.title} className="py-2">
                {!isCollapsed && (
                  <div className="px-4 py-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      {section.title}
                    </span>
                  </div>
                )}
                <SidebarMenu className="px-2">
                  {section.items.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-9 transition-all font-normal"
                        >
                          <item.icon
                            className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                          />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/20 text-primary">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {user?.role === "admin" ? "Admin" : user?.role === "subadmin" ? "Sub-Admin" : user?.role === "purchaser" ? "Purchaser" : user?.role === "staff" ? "Staff" : user?.role === "sales_rep" ? "Sales Rep" : "User"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="cursor-default text-muted-foreground text-xs">
                  {user?.email || "No email"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setLocation("/profile")}
                  className="cursor-pointer"
                >
                  <UserCircle className="mr-2 h-4 w-4" />
                  <span>My Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="tracking-tight text-foreground font-medium">
                {activeMenuItem?.label ?? "JMC Solar"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
