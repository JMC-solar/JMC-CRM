# JMC Solar CRM

A full-stack CRM (Customer Relationship Management) system built for JMC Solar. Manages leads, contacts, accounts, opportunities, inventory, quotations, purchase orders, projects, and more.

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Radix UI, Recharts
- **Backend:** Node.js, Express, tRPC
- **Database:** MySQL (via Drizzle ORM)
- **Storage:** AWS S3 (for file uploads)
- **Auth:** Local username/password with optional TOTP 2FA

## Prerequisites

- **Node.js** v20 or later
- **pnpm** (package manager)
- **MySQL** 8.0 or later (or a compatible service like PlanetScale, TiDB)
- **AWS S3 bucket** (or S3-compatible like DigitalOcean Spaces)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your database URL, JWT secret, S3 credentials, etc.

### 3. Set Up Database

Create your MySQL database, then run migrations:

```bash
pnpm run db:push
```

### 4. Add Your Logo

Place your logo file at:
```
client/public/images/jmc-solar-logo.png
```

### 5. Development

```bash
pnpm run dev
```

The app will be available at `http://localhost:3000`.

### 6. Production Build & Run

```bash
pnpm run build
pnpm run start
```

## Default Admin Account

On first startup, the system automatically creates a default admin account:

- **Username:** `jmcsolar`
- **Password:** `juanmiguel888`

> **Important:** Change this password immediately after your first login via Settings > Profile.

## Deployment (VPS with Nginx)

### Server Setup

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm pm2

# Install MySQL
apt-get install -y mysql-server

# Create database
mysql -e "CREATE DATABASE jmcsolar; CREATE USER 'jmcuser'@'localhost' IDENTIFIED BY 'your_password'; GRANT ALL ON jmcsolar.* TO 'jmcuser'@'localhost'; FLUSH PRIVILEGES;"
```

### Deploy the App

```bash
cd /var/www/jmc-solar-crm
pnpm install
pnpm run db:push
pnpm run build

# Run with PM2
pm2 start dist/index.js --name "jmcsolar"
pm2 save
pm2 startup
```

### Nginx + SSL

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/jmcsolar`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and secure:

```bash
ln -s /etc/nginx/sites-available/jmcsolar /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## AWS S3 Setup

1. Create an S3 bucket in your AWS account
2. Create an IAM user with `AmazonS3FullAccess` (or a custom policy for your bucket)
3. Add the credentials to your `.env` file

For **DigitalOcean Spaces** or **MinIO**, also set `S3_ENDPOINT`.

## Project Structure

```
├── client/              # React frontend
│   ├── public/images/   # Static assets (logo, etc.)
│   └── src/
│       ├── components/  # Reusable UI components
│       ├── pages/       # Page components
│       └── lib/         # Utilities & tRPC client
├── server/              # Express backend
│   ├── _core/           # Core server infrastructure
│   ├── routers.ts       # tRPC API routes
│   ├── localAuth.ts     # Authentication system
│   ├── storage.ts       # S3 file storage
│   └── db.ts            # Database connection
├── drizzle/             # Database schema & migrations
├── shared/              # Shared types & constants
└── .env.example         # Environment template
```

## License

MIT
