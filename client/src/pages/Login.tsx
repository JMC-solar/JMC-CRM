import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Lock, User, ShieldCheck } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // TOTP 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Please enter username and password");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Login failed");
        return;
      }

      if (data.requires2FA) {
        setRequires2FA(true);
        setUserId(data.userId);
      } else {
        if (data.token) {
          try { sessionStorage.setItem("app-session-token", data.token); } catch {}
        }
        toast.success("Login successful");
        window.location.href = "/dashboard";
      }
    } catch (err) {
      toast.error("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (index + i < 6) newCode[index + i] = d;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyTOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch("/api/auth/local/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: fullCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Verification failed");
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }
      if (data.token) {
        try { sessionStorage.setItem("app-session-token", data.token); } catch {}
      }
      toast.success("Login successful");
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    const fullCode = code.join("");
    if (fullCode.length === 6 && requires2FA && !isVerifying) {
      handleVerifyTOTP();
    }
  }, [code]);

  if (requires2FA) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-full max-w-md px-4">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Two-Factor Authentication</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Enter the 6-digit code from your authenticator app
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              (Google Authenticator, Authy, etc.)
            </p>
          </div>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <form onSubmit={handleVerifyTOTP} className="space-y-6">
                <div className="flex justify-center gap-2">
                  {code.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      className="w-12 h-14 text-center text-xl font-bold"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
                <Button type="submit" className="w-full" disabled={isVerifying || code.join("").length !== 6}>
                  {isVerifying ? "Verifying..." : "Verify & Sign In"}
                </Button>
              </form>
              <div className="flex flex-col items-center gap-3 mt-6">
                <p className="text-xs text-muted-foreground text-center">
                  Open your authenticator app and enter the current code for JMC Solar CRM
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setRequires2FA(false);
                    setCode(["", "", "", "", "", ""]);
                    setUserId(null);
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Back to login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md px-4">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/images/jmc-solar-logo.png"
            alt="JMC Solar"
            className="h-14 object-contain mb-4"
          />
          <h1 className="text-2xl font-bold text-foreground">JMC Solar CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    autoComplete="username"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            <div className="flex items-center justify-between mt-4">
              <a href="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot Password?
              </a>
              <p className="text-xs text-muted-foreground">
                Contact admin for an account.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
