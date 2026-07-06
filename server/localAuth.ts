import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { nanoid } from "nanoid";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

export const localAuthRouter = Router();

// POST /api/auth/local/login - Login with username/password (checks TOTP if enabled)
localAuthRouter.post("/api/auth/local/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    // Find user by username
    const [user] = await db.select().from(users).where(
      and(eq(users.username, username), eq(users.status, "active"))
    );

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Check if TOTP 2FA is enabled
    if (user.totpEnabled && user.totpSecret) {
      // Return that 2FA is required - don't log in yet
      return res.json({
        success: true,
        requires2FA: true,
        userId: user.id,
        message: "Please enter your authenticator code",
      });
    }

    // No 2FA - log in directly
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
    const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || username });
    const cookieOptions = getSessionCookieOptions(req);
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    return res.json({
      success: true,
      requires2FA: false,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
      token: sessionToken,
    });
  } catch (error) {
    console.error("[LocalAuth] Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/local/verify-totp - Verify TOTP code and complete login
localAuthRouter.post("/api/auth/local/verify-totp", async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ error: "User ID and code are required" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || !user.totpSecret) {
      return res.status(401).json({ error: "Invalid request" });
    }

    // Verify TOTP code
    const totp = new OTPAuth.TOTP({
      issuer: "JMC Solar CRM",
      label: user.username || user.name || "User",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: code, window: 2 });
    console.log(`[LocalAuth] TOTP login verify for user ${userId}: delta=${delta}`);
    if (delta === null) {
      return res.status(401).json({ error: "Invalid verification code. Please try again." });
    }

    // Code is valid - complete login
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
    const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || user.username || "" });
    const cookieOptions = getSessionCookieOptions(req);
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
      token: sessionToken,
    });
  } catch (error) {
    console.error("[LocalAuth] TOTP verify error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/local/totp/setup - Generate TOTP secret and QR code for setup
localAuthRouter.post("/api/auth/local/totp/setup", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate a new secret
    const secret = new OTPAuth.Secret({ size: 20 });

    const totp = new OTPAuth.TOTP({
      issuer: "JMC Solar CRM",
      label: user.username || user.name || "User",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

    // Store the secret temporarily (not enabled yet until confirmed)
    await db.update(users).set({ totpSecret: secret.base32 }).where(eq(users.id, user.id));

    return res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      otpauthUri,
    });
  } catch (error) {
    console.error("[LocalAuth] TOTP setup error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/local/totp/confirm - Confirm TOTP setup with a valid code
localAuthRouter.post("/api/auth/local/totp/confirm", async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ error: "User ID and code are required" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || !user.totpSecret) {
      return res.status(400).json({ error: "TOTP setup not initiated. Please start setup first." });
    }

    // Verify the code
    const totp = new OTPAuth.TOTP({
      issuer: "JMC Solar CRM",
      label: user.username || user.name || "User",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: code, window: 2 });
    console.log(`[LocalAuth] TOTP confirm attempt for user ${userId}: code=${code}, delta=${delta}`);
    if (delta === null) {
      return res.status(401).json({ error: "Invalid code. Please check your authenticator app and try again." });
    }

    // Enable TOTP
    await db.update(users).set({ totpEnabled: true }).where(eq(users.id, user.id));
    console.log(`[LocalAuth] TOTP enabled for user ${userId}`);

    return res.json({ success: true, message: "Two-factor authentication has been enabled successfully." });
  } catch (error) {
    console.error("[LocalAuth] TOTP confirm error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/local/totp/disable - Disable TOTP (requires valid code or admin)
localAuthRouter.post("/api/auth/local/totp/disable", async (req, res) => {
  try {
    const { userId, code, adminOverride } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If not admin override, verify current TOTP code
    if (!adminOverride && user.totpSecret && user.totpEnabled) {
      if (!code) {
        return res.status(400).json({ error: "Current authenticator code is required to disable 2FA" });
      }
      const totp = new OTPAuth.TOTP({
        issuer: "JMC Solar CRM",
        label: user.username || user.name || "User",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.totpSecret),
      });
      const delta = totp.validate({ token: code, window: 1 });
      if (delta === null) {
        return res.status(401).json({ error: "Invalid code. Cannot disable 2FA." });
      }
    }

    // Disable and clear TOTP
    await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, user.id));

    return res.json({ success: true, message: "Two-factor authentication has been disabled." });
  } catch (error) {
    console.error("[LocalAuth] TOTP disable error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/local/forgot-password - Request password reset email
localAuthRouter.post("/api/auth/local/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email address is required" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    // Find user by email
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    }

    // Generate reset token
    const resetToken = nanoid(40);
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.update(users).set({ resetToken, resetTokenExpiry }).where(eq(users.id, user.id));

    // Build reset link
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "";
    const resetLink = `${origin}/reset-password?token=${resetToken}`;

    // Send email
    const { sendPasswordResetEmail } = await import("./email");
    const sent = await sendPasswordResetEmail(email, resetLink, user.name || user.username || "User");

    if (!sent) {
      console.warn("[LocalAuth] Failed to send reset email, but token was generated");
    }

    return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
  } catch (error) {
    console.error("[LocalAuth] Forgot password error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/local/reset-password - Reset password using token
localAuthRouter.post("/api/auth/local/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    // Find user by reset token
    const [user] = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Check token expiry
    if (!user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
      return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({
      passwordHash,
      passwordPlain: newPassword,
      resetToken: null,
      resetTokenExpiry: null,
    }).where(eq(users.id, user.id));

    return res.json({ success: true, message: "Password has been reset successfully. You can now log in with your new password." });
  } catch (error) {
    console.error("[LocalAuth] Reset password error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Helper: hash a password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Helper: generate a unique openId for locally-created users
export function generateLocalOpenId(): string {
  return `local_${nanoid(20)}`;
}

// Seed default admin account on startup
export async function seedDefaultAdmin(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[LocalAuth] Cannot seed admin: database not available");
      return;
    }
    // Check if admin with username 'jmcsolar' already exists
    const [existing] = await db.select().from(users).where(eq(users.username, "jmcsolar")).limit(1);
    if (existing) {
      console.log("[LocalAuth] Default admin account already exists");
      return;
    }
    // Create default admin
    const passwordHash = await bcrypt.hash("juanmiguel888", 12);
    await db.insert(users).values({
      openId: `local_admin_${nanoid(10)}`,
      username: "jmcsolar",
      passwordHash,
      passwordPlain: "juanmiguel888",
      name: "JMC Solar Admin",
      email: "jmcsolarph@gmail.com",
      role: "admin",
      status: "active",
      loginMethod: "local",
      lastSignedIn: new Date(),
    });
    console.log("[LocalAuth] Default admin account created (username: jmcsolar)");
  } catch (error) {
    console.error("[LocalAuth] Failed to seed default admin:", error);
  }
}
