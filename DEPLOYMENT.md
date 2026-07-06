# JMC Solar CRM — Deployment Guide (Oracle Cloud Always Free VPS)

Self-hosted, serverful deploy: **Node 20 + PM2 + Nginx + MySQL 8** on one VM, S3 external (optional).
Internal CRM — lock down access, change the default admin password immediately.

This supplements the README's Deployment section with Oracle-specific steps and the fixes applied during setup.

---

## 0. Pre-flight (already verified locally)
- `pnpm install` ✅ (broken `wouter` patch removed)
- `pnpm check` (typecheck) ✅
- `pnpm run build` ✅ → `dist/public/` (client) + `dist/index.js` (server)
- `pnpm run start` (NODE_ENV=production) ✅ serves + login works
- Cross-platform scripts via `cross-env` ✅ (works on Linux too)
- Session cookie: `SameSite=Lax` on http, `None; Secure` on https (behind Nginx) ✅

---

## 1. Provision the Oracle VM
1. Oracle Cloud → **Compute → Instances → Create**.
2. Shape: **Ampere A1 (ARM), Always Free** — e.g. 1–2 OCPU / 6–12 GB. (If ARM "out of capacity", use **VM.Standard.E2.1.Micro** AMD, 2 free.)
3. Image: **Ubuntu 22.04**.
4. Add your SSH public key. Note the **public IP**.
5. **Open ports 80 + 443** in the VCN **Security List** (Ingress Rules):
   - Source `0.0.0.0/0`, TCP, dest port **80**
   - Source `0.0.0.0/0`, TCP, dest port **443**
   - (Oracle blocks these by default — this step is the #1 Oracle gotcha.)

## 2. DNS
Point your domain's **A record** → VM public IP. (Both `yourdomain.com` and `www` if used.)

## 3. Server setup (SSH in as ubuntu)
```bash
sudo apt-get update && sudo apt-get upgrade -y

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm pm2

# MySQL 8
sudo apt-get install -y mysql-server
sudo systemctl enable --now mysql

# Nginx + certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# OS firewall (Ubuntu ufw) — Oracle needs BOTH this and the Security List
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```
Optional (small ARM/AMD shapes) — add swap so `pnpm build` doesn't OOM:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Create the database
```bash
sudo mysql -e "CREATE DATABASE jmcsolar CHARACTER SET utf8mb4;
CREATE USER 'jmcuser'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL ON jmcsolar.* TO 'jmcuser'@'localhost';
FLUSH PRIVILEGES;"
```

## 5. Get the code onto the VM
Option A — git (recommended): push this repo to GitHub, then on the VM:
```bash
sudo mkdir -p /var/www && sudo chown $USER /var/www
cd /var/www && git clone <your-repo-url> jmc-solar-crm && cd jmc-solar-crm
```
Option B — no git: `scp` a zip of the project to `/var/www/jmc-solar-crm` (exclude `node_modules`, `dist`).

## 6. Configure environment
```bash
cd /var/www/jmc-solar-crm
cp .env.example .env
nano .env
```
Fill in:
- `DATABASE_URL=mysql://jmcuser:REPLACE_WITH_STRONG_PASSWORD@localhost:3306/jmcsolar`
- `JWT_SECRET=` → generate: `openssl rand -base64 32`
- `PORT=3000`
- S3_* only if you later wire file uploads (unused today — can leave blank)
- SMTP_* only if you want password-reset / 2FA emails
- Do **not** add `NODE_ENV` (scripts set it)

## 7. Build + migrate + run
```bash
pnpm install
pnpm run db:push        # creates 33 tables
pnpm run build
pm2 start dist/index.js --name jmcsolar
pm2 save
pm2 startup             # run the command it prints, to survive reboots
```

## 8. Nginx reverse proxy + SSL
Create `/etc/nginx/sites-available/jmcsolar` (see README for the full server block — proxies to `localhost:3000`, `client_max_body_size 50M`). Then:
```bash
sudo ln -s /etc/nginx/sites-available/jmcsolar /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
certbot rewrites the config for HTTPS. This also makes `x-forwarded-proto=https` reach the app → session cookie becomes `Secure` automatically.

## 9. Post-deploy (DO THESE)
1. Visit `https://yourdomain.com` → log in `jmcsolar` / `juanmiguel888`.
2. **Change the admin password immediately** (Settings → Profile).
3. Enable **TOTP 2FA** for admin.
4. Internal-only? Restrict access — either limit the Oracle Security List / Nginx `allow <office-ip>; deny all;`, or keep public but rely on strong auth + 2FA.

## 10. Ops cheatsheet
```bash
pm2 logs jmcsolar          # app logs
pm2 restart jmcsolar       # after code update: git pull && pnpm install && pnpm run build && pm2 restart jmcsolar
mysqldump -u jmcuser -p jmcsolar > backup_$(date +%F).sql   # DB backup
```

---

## Known / deferred
- **Bundle >500 kB** — single JS chunk (~1.3 MB / 343 kB gzip). Fine for internal use; code-split later if load feels slow.
- **`passwordPlain`** column stores admin-viewable plaintext passwords (deliberate feature). Security smell — consider removing before wider rollout.
- **S3 / file uploads** — not wired in code yet; configure only when that feature is built.
