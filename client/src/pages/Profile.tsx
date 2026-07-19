import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { User, Key, Shield, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Profile form
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState((user as any)?.mobile || "");

  // Username change
  const [newUsername, setNewUsername] = useState((user as any)?.username || "");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 2FA setup state
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // 2FA disable state
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [isDisabling, setIsDisabling] = useState(false);

  const updateProfile = trpc.users.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const changeUsername = trpc.users.changeUsername.useMutation({
    onSuccess: () => {
      toast.success("Username changed successfully");
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const changePassword = trpc.users.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpdateProfile = () => {
    updateProfile.mutate({ name, email, mobile });
  };

  const handleChangeUsername = () => {
    if (!newUsername || newUsername.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    changeUsername.mutate({ newUsername });
  };

  const handleChangePassword = () => {
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  // 2FA Setup
  const handleStartSetup = async () => {
    setIsSettingUp(true);
    try {
      const res = await fetch("/api/auth/local/totp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to start 2FA setup");
        return;
      }
      setQrCode(data.qrCode);
      setSecretKey(data.secret);
      setShowSetup(true);
    } catch (err) {
      toast.error("Failed to start 2FA setup");
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleConfirmSetup = async () => {
    if (setupCode.length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }
    setIsConfirming(true);
    try {
      const res = await fetch("/api/auth/local/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id, code: setupCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Invalid code. Please try again.");
        return;
      }
      toast.success("Two-factor authentication enabled successfully!");
      setShowSetup(false);
      setSetupCode("");
      setQrCode("");
      setSecretKey("");
      utils.auth.me.invalidate();
    } catch (err) {
      toast.error("Failed to confirm 2FA setup");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDisable2FA = async () => {
    if (disableCode.length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }
    setIsDisabling(true);
    try {
      const res = await fetch("/api/auth/local/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id, code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to disable 2FA");
        return;
      }
      toast.success("Two-factor authentication disabled");
      setShowDisable(false);
      setDisableCode("");
      utils.auth.me.invalidate();
    } catch (err) {
      toast.error("Failed to disable 2FA");
    } finally {
      setIsDisabling(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secretKey);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
    toast.success("Secret key copied to clipboard");
  };

  const isLocalAccount = (user as any)?.loginMethod === "local";
  const totpEnabled = (user as any)?.totpEnabled || false;

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: "Admin",
      subadmin: "Sub Admin",
      purchaser: "Purchaser",
      staff: "Staff",
      sales_rep: "Sales Rep",
    };
    return labels[role] || role;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and credentials</p>
      </div>

      {/* Account Info */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{user?.name || "User"}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{getRoleLabel(user?.role || "")}</Badge>
                {isLocalAccount && <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">Local Account</Badge>}
                {totpEnabled && <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">2FA Enabled</Badge>}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Profile Details */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Profile Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" />
          </div>
          <div className="space-y-2">
            <Label>Mobile Number</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Your mobile number" />
          </div>
          <Button onClick={handleUpdateProfile} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      {isLocalAccount && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Two-Factor Authentication (2FA)
            </CardTitle>
            <CardDescription>
              Secure your account with Google Authenticator or any TOTP-compatible app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!totpEnabled && !showSetup && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Two-factor authentication adds an extra layer of security to your account.
                  When enabled, you'll need to enter a code from your authenticator app each time you log in.
                </p>
                <Button onClick={handleStartSetup} disabled={isSettingUp}>
                  {isSettingUp ? "Setting up..." : "Enable 2FA"}
                </Button>
              </div>
            )}

            {showSetup && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                  <h4 className="font-medium text-sm">Step 1: Scan QR Code</h4>
                  <p className="text-xs text-muted-foreground">
                    Open Google Authenticator (or any TOTP app) and scan this QR code:
                  </p>
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <h4 className="font-medium text-sm">Or enter this key manually:</h4>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-background border rounded text-xs font-mono break-all">
                      {secretKey}
                    </code>
                    <Button variant="outline" size="sm" onClick={copySecret}>
                      {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save this key in a safe place. You'll need it if you lose access to your authenticator app.
                  </p>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
                  <h4 className="font-medium text-sm text-primary">Step 2: Enter verification code</h4>
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code shown in your authenticator app to confirm setup.
                    The code changes every 30 seconds.
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      value={setupCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setSetupCode(val);
                      }}
                      placeholder="000000"
                      className="w-36 text-center font-mono text-xl tracking-[0.3em] border-primary/50"
                      maxLength={6}
                      autoFocus
                    />
                    <Button onClick={handleConfirmSetup} disabled={isConfirming || setupCode.length !== 6} size="lg">
                      {isConfirming ? "Verifying..." : "Confirm & Enable 2FA"}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-500 font-medium">
                    You must complete this step to activate 2FA. Without confirmation, 2FA will not be active.
                  </p>
                </div>

                <Button variant="ghost" size="sm" onClick={() => { setShowSetup(false); setSetupCode(""); }}>
                  Cancel
                </Button>
              </div>
            )}

            {totpEnabled && !showDisable && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-500">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-sm font-medium">Two-factor authentication is active</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your account is protected with an authenticator app. You'll be asked for a code each time you log in.
                </p>
                <Button variant="destructive" size="sm" onClick={() => setShowDisable(true)}>
                  <ShieldOff className="h-4 w-4 mr-2" />
                  Disable 2FA
                </Button>
              </div>
            )}

            {totpEnabled && showDisable && (
              <div className="space-y-3 p-4 border border-destructive/30 rounded-lg">
                <p className="text-sm text-destructive font-medium">Disable Two-Factor Authentication</p>
                <p className="text-xs text-muted-foreground">
                  Enter your current authenticator code to confirm disabling 2FA:
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-32 text-center font-mono text-lg tracking-widest"
                    maxLength={6}
                  />
                  <Button variant="destructive" size="sm" onClick={handleDisable2FA} disabled={isDisabling || disableCode.length !== 6}>
                    {isDisabling ? "Disabling..." : "Confirm Disable"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowDisable(false); setDisableCode(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Change Username - only for local accounts */}
      {isLocalAccount && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Change Username
            </CardTitle>
            <CardDescription>Update your login username</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>New Username</Label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Enter new username (min 3 characters)" />
            </div>
            <Button onClick={handleChangeUsername} disabled={changeUsername.isPending}>
              {changeUsername.isPending ? "Updating..." : "Update Username"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Change Password - only for local accounts */}
      {isLocalAccount && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              Change Password
            </CardTitle>
            <CardDescription>Update your login password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password (min 6 characters)" />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
            </div>
            <Button onClick={handleChangePassword} disabled={changePassword.isPending}>
              {changePassword.isPending ? "Changing..." : "Change Password"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLocalAccount && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              Authentication
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your account uses OAuth authentication. Username and password management is not available for OAuth accounts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
