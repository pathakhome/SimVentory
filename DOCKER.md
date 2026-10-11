# 🐳 Hosting SimVentory on Docker & Raspberry Pi 4

SimVentory is packaged as a multi-architecture Docker container compatible with:
- **Raspberry Pi 4 (ARM64 / aarch64 & armv7)**
- **x86 / AMD64 (Linux, Windows, macOS)**

All component records, photos, and usage history are stored in a centralized, persistent volume (`./data`), allowing seamless multi-device access from your PC and mobile phone.

---

## 🚀 Quick Start (Any Machine)

### 1. Start with Docker Compose
From the project folder, run:
```bash
docker compose up -d
```

That's it! Open your browser and navigate to:
**`http://localhost:8080`**

To stop the container:
```bash
docker compose down
```

---

## 🍓 Deploying to Raspberry Pi 4

### Step 1: Transfer the Project to your Pi
Copy the project folder to your Raspberry Pi 4 via `scp`, `rsync`, or Git:
```bash
# Example from your PC:
scp -r f:/Inventory pi@192.168.1.50:~/simventory
```

### Step 2: Build and Run on the Pi
SSH into your Raspberry Pi and run:
```bash
cd ~/simventory
docker compose up -d --build
```
Docker will build the multi-stage image natively on the Pi using Alpine Linux (`node:20-alpine`), consuming less than **40 MB of RAM**.

### Step 3: Access from Any Device on Your Network
Find your Raspberry Pi's local IP address (`hostname -I` or check your router):
```
http://<raspberry-pi-ip>:8080
```
For example: `http://192.168.1.50:8080`

---

## ⚡ Instant Pull & Deploy (No Source Code Needed on Pi)

Once you push your repository to GitHub, the included **GitHub Actions workflow** (`.github/workflows/docker-publish.yml`) automatically builds and publishes a multi-arch container image (`linux/arm64` and `linux/amd64`) to **GitHub Container Registry (GHCR)**.

On your Raspberry Pi or home server, you do **not** need the source code or build tools. You just need a single `docker-compose.yml`:

### 1. Create a Directory & Compose File on your Raspberry Pi:
```bash
mkdir -p ~/simventory && cd ~/simventory
nano docker-compose.yml
```

Paste this configuration (replace `<your-github-username>` with your actual GitHub username):
```yaml
services:
  simventory:
    image: ghcr.io/<your-github-username>/simventory:latest
    container_name: simventory
    restart: unless-stopped
    ports:
      - "8080:3000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3000
      - DATA_DIR=/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

### 2. Pull & Run:
```bash
docker compose pull
docker compose up -d
```

### 3. Future Updates (1-liner):
Whenever you push changes or new commits to GitHub, wait 1–2 minutes for GitHub Actions to build the image, then simply run on your Pi:
```bash
docker compose pull && docker compose up -d
```
All your items, photos, and settings stay completely safe in `./data/`.

> **Note on GHCR package visibility**:
> In GitHub, go to your repository → **Packages** (on the right sidebar) → click on the package → **Package settings** → change visibility to **Public** so your Raspberry Pi can pull it without needing `docker login`. (Or run `echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin` if keeping private).

---

## 📱 Mobile Browser Camera & Photo Upload

When accessing SimVentory from your smartphone browser (Safari on iOS, Chrome / Firefox on Android):

1. Go to **Add Item** in the navigation bar.
2. Under the Image section, you have two options:
   - 📸 **Take Photo**: Directly launches your phone's camera (`capture="environment"`). Point, shoot, and attach!
   - 🖼️ **Choose File / Gallery**: Pick an existing photo from your photo library or device files.
3. **Automatic Client-Side Compression**: 
   High-resolution phone photos (e.g., 12MP/48MP files that are 8MB–15MB) are automatically resized to max 1600px and compressed to crisp WebP/JPEG (~200–300KB) right inside the browser before uploading.
   - Uploads complete in milliseconds even over home Wi-Fi.
   - Keeps your Raspberry Pi's storage clean and responsive.
4. Items created on your phone are instantly accessible on your desktop workbench.

---

## ⚙️ Configuration & Ports

In `docker-compose.yml`:

```yaml
services:
  simventory:
    build: .
    image: simventory:latest
    container_name: simventory
    restart: unless-stopped
    ports:
      # Change 8080 to any port you prefer on your host
      - "8080:3000"
    volumes:
      # All items and images are stored here on your host
      - ./data:/app/data
    environment:
      - PORT=3000
      - DATA_DIR=/app/data
```

---

## 💾 Backups & Data Management

All data resides in `./data/`:
- `inventory.json` — All components, categories, tags, locations, and usage logs.
- `images/` — Component photos stored as optimized files.

### Backup Options:
1. **In-App Backup**: Navigate to **Settings** → click **Export JSON** (includes all images as Base64) or **Export CSV** (for spreadsheets).
2. **File-Level Backup**: Simply back up the `./data` directory on your Raspberry Pi:
   ```bash
   tar -czvf simventory-backup-$(date +%F).tar.gz ./data
   ```
