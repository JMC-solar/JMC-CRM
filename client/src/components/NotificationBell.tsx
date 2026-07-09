import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";

export default function NotificationBell() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: notifications } = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30000 });
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 30000 });

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); },
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {!!unreadCount && unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center bg-red-500 text-white border-0 px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 bg-card border-border">
        <div className="p-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">Notifications</span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No notifications yet.</p>
          ) : (
            notifications.map((n: any) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read) markReadMutation.mutate({ id: n.id });
                  if (n.link) setLocation(n.link);
                }}
                className={`w-full text-left p-3 border-b border-border/50 hover:bg-muted/30 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
              >
                <p className="text-sm text-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
