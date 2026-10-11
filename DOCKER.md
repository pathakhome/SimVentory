# 🐳 Hosting ComponentVault on Docker & Raspberry Pi 4

ComponentVault is packaged as a multi-architecture Docker container compatible with:
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
scp -r f:/Inventory pi@192.168.1.50:~/inventory
```

### Step 2: Build and Run on the Pi
SSH into your Raspberry Pi and run:
```bash
cd ~/inventory
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

## 📱 Mobile Browser Camera & Photo Upload

When accessing ComponentVault from your smartphone browser (Safari on iOS, Chrome / Firefox on Android):

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
  componentvault:
    build: .
    image: componentvault:latest
    container_name: componentvault
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
   tar -czvf componentvault-backup-$(date +%F).tar.gz ./data
   ```
