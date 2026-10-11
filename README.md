# ⚡ ComponentVault

> **Electronics & DIY Hobbyist Component Inventory Manager**  
> Tailored for Raspberry Pi 4 (ARM64) and desktop/server hosting via Docker. Fast, lightweight, offline-resilient, and mobile-friendly with built-in camera scanning.

---

## ✨ Features

- **🏷️ Custom Categories**: Create and personalize categories with custom emoji icons and colors (Sensors, ICs, Microcontrollers, Relays, etc.).
- **📍 Storage Locations**: Keep track of parts across bins, drawers, shelves, and tackle boxes with quick suggestions and autocomplete.
- **📷 Barcode & QR Code Scanner**: Scan component labels, bags, or reels with your phone camera or webcam to instantly find items, adjust stock, or add new components by prefilling SKUs.
- **📱 Mobile Photo Capture**: Snap photos of your ICs and circuits directly from your mobile browser with automatic on-device compression and aspect-ratio optimization.
- **📦 Multi-Arch Docker Ready**: Pre-configured for both **Raspberry Pi 4 (linux/arm64)** and standard **x86_64/AMD64** machines.
- **💾 Dual-Layer Storage**: Zero native compilation dependencies. Uses standard JSON storage and image file storage on the server with IndexedDB offline fallback.
- **🔄 Import & Export**: One-click JSON backup (including base64 photos) and spreadsheet-compatible CSV export.
- **🎨 Modern Dark & Light Mode**: Curated HSL aesthetics with quick-stock adjustment shortcuts (`-1 Use`, `+1 Restock`).

---

## 🚀 Quick Start with Docker (Raspberry Pi & PC)

### 1. Clone & Launch
```bash
git clone <your-repo-url>
cd Inventory
docker compose up -d --build
```

### 2. Access ComponentVault
Open your browser and navigate to:
```
http://localhost:8080
```
*(Or `http://<your-raspi-ip>:8080` from your phone or tablet on your local Wi-Fi).*

Data is persistently stored in `./data` on your host machine.

---

## 🛠️ Local Development (Without Docker)

Requires **Node.js 18+**:

```bash
# Install dependencies
npm install

# Start Vite frontend dev server
npm run dev

# (Optional) Run standalone production server
npm run build
node server.js
```

---

## 📸 Barcode & Scanning Workflow

1. Tap **Scan Code** in the top navigation or on the dashboard.
2. Point your camera at any 1D barcode or 2D QR code on a component bag or label.
3. **If recognized**: ComponentVault shows component details with quick `-1 Use` and `+1 Restock` buttons.
4. **If new**: Click **"+ Add Component with this SKU"** to open the creation form with the part number automatically filled in.
5. In the Add/Edit form, you can also click the **"Scan Barcode"** button next to Part Number / SKU at any time.

---

## 📁 Project Structure

```
Inventory/
├── data/                  # Persistent database (inventory.json) & component images
├── public/                # Static icons and assets
├── src/
│   ├── views/
│   │   ├── dashboard.js   # Analytics, quick actions & category breakdowns
│   │   ├── inventory.js   # Grid/list view, filtering, sorting & search
│   │   ├── itemForm.js    # Add/edit form with camera capture & quick add
│   │   ├── itemModal.js   # Component details, history & quick stock actions
│   │   ├── scannerModal.js# Camera & file barcode/QR scanner
│   │   └── settings.js    # Category & location manager, backup/restore
│   ├── categories.js      # Dynamic category helpers & defaults
│   ├── db.js              # Dual-layer storage (REST API + IndexedDB)
│   ├── imageUtil.js       # Client-side mobile image compressor
│   ├── main.js            # App router, theme & navigation
│   ├── style.css          # Design system & dark/light mode styles
│   └── toast.js           # Toast notification system
├── server.js              # Lightweight Express 5 REST API & static server
├── Dockerfile             # Multi-stage multi-arch build
├── docker-compose.yml     # Persistent Docker compose config
└── DOCKER.md              # Raspberry Pi 4 deployment guide
```

---

## 🔒 License
MIT License. Created for makers and DIY electronics enthusiasts.
