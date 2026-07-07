import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState } from "react";
import { UserPlus, Ban, CheckCircle, Trash2, Key, Users, ClipboardList, Pencil, Mail, ShieldOff, ShieldCheck, Search } from "lucide-react";
import { confirm } from "@/lib/confirm";

export default function UserManagement() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [userSearch, setUserSearch] = useState("");
  const { data: usersList = [], isLoading } = trpc.users.list.useQuery({ search: userSearch || undefined });
  const { data: auditLogsList = [] } = trpc.users.auditLogs.useQuery({ limit: 100 });

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editForm, setEditForm] = useState({ username: "", email: "", mobile: "", name: "" });

  // Create user form state
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    mobile: "",
    role: "" as string,
  });

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("User created successfully");
      utils.users.list.invalidate();
      setShowCreateDialog(false);
      setCreateForm({ username: "", password: "", name: "", email: "", mobile: "", role: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.users.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const deactivateUser = trpc.users.deactivate.useMutation({
    onSuccess: () => { toast.success("User deactivated"); utils.users.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const activateUser = trpc.users.activate.useMutation({
    onSuccess: () => { toast.success("User activated"); utils.users.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => { toast.success("User deleted"); utils.users.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password reset successfully");
      utils.users.list.invalidate();
      setShowResetPasswordDialog(false);
      setNewPassword("");
      setSelectedUserId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const sendResetEmail = trpc.users.sendResetEmail.useMutation({
    onSuccess: () => toast.success("Password reset email sent successfully"),
    onError: (err) => toast.error(err.message),
  });

  const updateUserDetails = trpc.users.updateUserDetails.useMutation({
    onSuccess: () => {
      toast.success("User details updated");
      utils.users.list.invalidate();
      setShowEditUserDialog(false);
      setSelectedUserId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const reset2FA = trpc.users.reset2FA.useMutation({
    onSuccess: () => {
      toast.success("2FA has been reset. User will need to set up authenticator again.");
      utils.users.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleOpenEditUser = (u: any) => {
    setSelectedUserId(u.id);
    setEditForm({ username: u.username || "", email: u.email || "", mobile: u.mobile || "", name: u.name || "" });
    setShowEditUserDialog(true);
  };

  const handleSaveEditUser = () => {
    if (!selectedUserId) return;
    updateUserDetails.mutate({
      userId: selectedUserId,
      username: editForm.username || undefined,
      email: editForm.email || undefined,
      mobile: editForm.mobile || undefined,
      name: editForm.name || undefined,
    });
  };

  const isAdmin = user?.role === "admin";
  const isSubAdmin = user?.role === "subadmin";

  // Determine which roles the current user can create
  const creatableRoles = isAdmin
    ? [{ value: "subadmin", label: "Sub Admin" }, { value: "purchaser", label: "Purchaser" }, { value: "staff", label: "Staff" }, { value: "sales_rep", label: "Sales Rep" }]
    : isSubAdmin
    ? [{ value: "purchaser", label: "Purchaser" }, { value: "staff", label: "Staff" }, { value: "sales_rep", label: "Sales Rep" }]
    : [];

  const getRoleBadge = (role: string) => {
    const variants: Record<string, string> = {
      admin: "bg-red-500/20 text-red-400 border-red-500/30",
      subadmin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      purchaser: "bg-green-500/20 text-green-400 border-green-500/30",
      staff: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      sales_rep: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    const labels: Record<string, string> = {
      admin: "Admin",
      subadmin: "Sub Admin",
      purchaser: "Purchaser",
      staff: "Staff",
      sales_rep: "Sales Rep",
    };
    return <Badge className={`${variants[role] || ""} border`}>{labels[role] || role}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</Badge>;
    return <Badge className="bg-gray-500/20 text-gray-400 border border-gray-500/30">Inactive</Badge>;
  };

  const handleCreate = () => {
    if (!createForm.username || !createForm.password || !createForm.name || !createForm.role) {
      toast.error("Please fill in all required fields");
      return;
    }
    createUser.mutate({
      username: createForm.username,
      password: createForm.password,
      name: createForm.name,
      email: createForm.email || undefined,
      mobile: createForm.mobile || undefined,
      role: createForm.role as any,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Management</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? "Manage all users, roles, and permissions" : "Manage your team members"}
            </p>
          </div>
          {(isAdmin || isSubAdmin) && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Create User
            </Button>
          )}
        </div>

        <Tabs defaultValue="team" className="space-y-4">
          <TabsList className="bg-muted/50 border border-border">
            <TabsTrigger value="team" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <Users className="h-4 w-4" />Team Members
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <ClipboardList className="h-4 w-4" />Activity Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="p-4 border-b border-border">
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by username, name, email, role..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="pl-10 bg-input border-border" />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Username</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Mobile</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Role</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">2FA</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Last Login</th>
                        {isAdmin && <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                      ) : usersList.length === 0 ? (
                        <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No users found</td></tr>
                      ) : (
                        usersList.map((u: any) => (
                          <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="p-4 font-medium text-foreground">{u.name || "—"}</td>
                            <td className="p-4 text-sm text-muted-foreground">{u.username || "—"}</td>
                            <td className="p-4 text-sm text-muted-foreground">{u.email || "—"}</td>
                            <td className="p-4 text-sm text-muted-foreground">{u.mobile || "—"}</td>
                            <td className="p-4">{getRoleBadge(u.role)}</td>
                            <td className="p-4">
                              {u.totpEnabled ? (
                                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30"><ShieldCheck className="h-3 w-3 mr-1" />On</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Off</span>
                              )}
                            </td>
                            <td className="p-4">{getStatusBadge(u.status || "active")}</td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "Never"}
                            </td>
                            {isAdmin && (
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {u.id !== user?.id ? (
                                    <>
                                      <Select
                                        value={u.role}
                                        onValueChange={(val) => updateRole.mutate({ userId: u.id, role: val as any })}
                                      >
                                        <SelectTrigger className="w-[110px] h-7 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="admin">Admin</SelectItem>
                                          <SelectItem value="subadmin">Sub Admin</SelectItem>
                                          <SelectItem value="purchaser">Purchaser</SelectItem>
                                          <SelectItem value="staff">Staff</SelectItem>
                                          <SelectItem value="sales_rep">Sales Rep</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="Edit Details"
                                        onClick={() => handleOpenEditUser(u)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="Reset Password"
                                        onClick={() => { setSelectedUserId(u.id); setShowResetPasswordDialog(true); }}
                                      >
                                        <Key className="h-3.5 w-3.5" />
                                      </Button>
                                      {u.email && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-blue-400"
                                          title="Send Reset Email"
                                          onClick={() => sendResetEmail.mutate({ userId: u.id, origin: window.location.origin })}
                                          disabled={sendResetEmail.isPending}
                                        >
                                          <Mail className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      {u.totpEnabled && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-orange-400"
                                          title="Reset 2FA"
                                          onClick={async () => { if (await confirm(`Reset 2FA for ${u.name || u.username}? They will need to set up their authenticator app again.`)) reset2FA.mutate({ userId: u.id }); }}
                                        >
                                          <ShieldOff className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      {u.status === "active" ? (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-yellow-500"
                                          title="Deactivate"
                                          onClick={() => deactivateUser.mutate({ userId: u.id })}
                                        >
                                          <Ban className="h-3.5 w-3.5" />
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-emerald-500"
                                          title="Activate"
                                          onClick={() => activateUser.mutate({ userId: u.id })}
                                        >
                                          <CheckCircle className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive"
                                        title="Delete"
                                        onClick={async () => { if (await confirm("Are you sure you want to delete this user?")) deleteUser.mutate({ userId: u.id }); }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">You</span>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg">Activity Logs</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">User</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Action</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Entity</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Details</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogsList.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No activity logs yet</td></tr>
                      ) : (
                        auditLogsList.map((log: any) => (
                          <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="p-4 text-sm font-medium text-foreground">{log.userName || "System"}</td>
                            <td className="p-4">
                              <Badge variant="outline" className="text-xs">{log.action}</Badge>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground capitalize">{log.entity?.replace("_", " ")}</td>
                            <td className="p-4 text-sm text-muted-foreground max-w-[300px] truncate">{log.details}</td>
                            <td className="p-4 text-sm text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create User Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="Enter username (for login)"
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Enter password (min 6 characters)"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile Number</Label>
                <Input
                  value={createForm.mobile}
                  onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })}
                  placeholder="Enter mobile number"
                />
              </div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={createForm.role} onValueChange={(val) => setCreateForm({ ...createForm, role: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {creatableRoles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createUser.isPending}>
                {createUser.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Details Dialog */}
        <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="Enter email"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile Number</Label>
                <Input
                  value={editForm.mobile}
                  onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                  placeholder="Enter mobile number"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditUserDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveEditUser} disabled={updateUserDetails.isPending}>
                {updateUserDetails.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowResetPasswordDialog(false); setNewPassword(""); }}>Cancel</Button>
              <Button
                onClick={() => { if (selectedUserId && newPassword.length >= 6) resetPassword.mutate({ userId: selectedUserId, newPassword }); }}
                disabled={resetPassword.isPending || newPassword.length < 6}
              >
                {resetPassword.isPending ? "Resetting..." : "Reset Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
