# Express Cargo - cPanel Shared Hosting Deployment Guide

This guide provides step-by-step instructions for deploying the **Express Cargo** Node.js backend and connected static frontend onto any standard **cPanel shared hosting environment** (using CloudLinux / Phusion Passenger Node.js Selector).

---

## Prerequisites
- A cPanel hosting account with **Setup Node.js App** (Phusion Passenger).
- A free or paid **MongoDB Atlas** database cluster.
- A **Cloudinary** free account (for cargo document and photo storage).
- An active domain name with SSL certificate (e.g. Let's Encrypt via cPanel SSL/TLS Status).
- An SMTP account (cPanel Webmail, Gmail App Password, Hostinger, or Resend).

---

## Step 1: Upload Backend & Frontend Files
1. In your local development machine, create a zip archive of the project root (excluding `node_modules` and `.git`).
2. Log in to your **cPanel Dashboard** and open **File Manager**.
3. Navigate to your desired application directory:
   - For primary domain: `/home/<cpanel_user>/public_html` or `/home/<cpanel_user>/express-cargo`
4. Click **Upload**, upload your `.zip` archive, and click **Extract**.

---

## Step 2: Open "Setup Node.js App" in cPanel
1. In cPanel, search for **Setup Node.js App** (under the *Software* category).
2. Click **Create Application**.

---

## Step 3: Select Node.js Version
1. Set **Node.js version** to **`18.x`** or **`20.x` LTS**.
2. Set **Application mode** to **`Production`**.

---

## Step 4: Configure Application Root & URL
1. **Application root**: Enter the folder where you extracted the project (e.g., `public_html` or `express-cargo`).
2. **Application URL**: Select your domain or subdomain (e.g., `express-cargo.ltd` or `tracking.yourdomain.com`).

---

## Step 5: Configure Application Startup File
1. **Application startup file**: Enter **`server.js`**.
2. Click **Create** (or **Save**).

---

## Step 6: Install Node.js Dependencies
1. Scroll down to the **Detected configuration files** section.
2. If `package.json` is detected, click the **Run NPM Install** button.
3. *Alternative (Terminal)*:
   - Copy the command shown at the top of the Node.js App page (e.g., `source /home/user/nodevenv/.../activate`).
   - Open cPanel **Terminal**, paste the activation command, and run:
     ```bash
     npm install --production
     ```

---

## Step 7: Configure Environment Variables in cPanel
In the **Setup Node.js App** interface, scroll to **Environment variables** and click **Add Variable** for each of the following:

| Name | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production environment mode |
| `PORT` | `5000` | Port handled by Passenger |
| `CLIENT_URL` | `https://yourdomain.com` | Allowed CORS origin (comma-separated) |
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB Atlas URI |
| `JWT_SECRET` | `long_random_secret_string_32_chars` | Authentication signing secret |
| `JWT_REFRESH_SECRET`| `another_long_random_secret_32_chars` | Refresh token signing secret |
| `SMTP_HOST` | `smtp.yourdomain.com` or `smtp.resend.com` | SMTP Server Host |
| `SMTP_PORT` | `465` (SSL) or `587` (TLS) | SMTP Port |
| `SMTP_USER` | `dispatch@yourdomain.com` | SMTP Username |
| `SMTP_PASSWORD` | `your_secure_password_or_api_key` | SMTP Password / API Key |
| `SMTP_FROM` | `"Express Cargo" <dispatch@yourdomain.com>` | Default Sender Name & Email |
| `CLOUDINARY_CLOUD_NAME` | `your_cloud_name` | Cloudinary Account Name |
| `CLOUDINARY_API_KEY` | `your_api_key` | Cloudinary API Key |
| `CLOUDINARY_API_SECRET` | `your_api_secret` | Cloudinary API Secret |

*(Alternatively, you can create a `.env` file in your application root directory via cPanel File Manager).*

---

## Step 8: Connect MongoDB Atlas
1. Log into [MongoDB Cloud](https://cloud.mongodb.com/).
2. Under **Network Access**, click **Add IP Address**:
   - For shared hosting with dynamic server IPs, choose **Allow Access From Anywhere** (`0.0.0.0/0`) or whitelist your cPanel server's dedicated outgoing IP.
3. Under **Database Access**, verify your database user has read/write privileges.
4. Under **Database -> Connect -> Drivers**, copy the connection string and paste it into the `MONGODB_URI` variable.

---

## Step 9: Configure SMTP Email Delivery
1. If using cPanel Webmail:
   - Create an email account under **Email Accounts** (e.g. `support@yourdomain.com`).
   - Use server name as `SMTP_HOST` (e.g. `mail.yourdomain.com`), port `465`, SSL enabled.
2. If using **Resend**:
   - `SMTP_HOST`: `smtp.resend.com`
   - `SMTP_PORT`: `465`
   - `SMTP_USER`: `resend`
   - `SMTP_PASSWORD`: `re_your_api_key`

---

## Step 10: Configure Cloudinary Object Storage
1. Sign in to your [Cloudinary Dashboard](https://cloudinary.com/console).
2. Copy your **Cloud Name**, **API Key**, and **API Secret**.
3. Add these to the cPanel environment variables so cargo photos and waybill PDFs upload directly to CDN storage rather than consuming shared hosting RAM.

---

## Step 11: Configure Frontend API URL
1. If frontend assets (`index.html`, `order.html`, `js/live-tracker.js`) are served directly from the same domain root:
   - The frontend automatically points to relative paths (`/api/tracking/...`, `/api/shipments/...`) and auto-detects the Socket.IO host!
2. If serving frontend on an external domain:
   - Ensure the external domain is added to `CLIENT_URL` in `.env`.

---

## Step 12: Restart Application
1. Return to **Setup Node.js App** in cPanel.
2. Click the **Restart** button at the top right.

---

## Step 13: Test `/health` Endpoint
Open your browser or run a cURL command against your domain:

```bash
curl -i https://yourdomain.com/health
```

### Expected Response:
```json
{
  "success": true,
  "status": "healthy"
}
```

> **Security Note:** The `/health` endpoint strictly returns `"status": "healthy"` and never exposes database connection strings, credentials, or internal server configurations.

---

## Production Maintenance & Verification Commands

```bash
# Verify backend runs without syntax issues
node -e "const { app } = require('./server'); console.log('Ready');"

# Run tests locally before deploying
npm test
```

