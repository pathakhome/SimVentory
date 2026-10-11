# ⚡ SimVentory

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
cd simventory
docker compose up -d --build
```

### 2. Access SimVentory
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

## 🚀 AI Intake Queue & Vision Workflow

1. Navigate to **AI Queue** in the sidebar navigation or from the Dashboard quick action.
2. Set a **Batch Location\*** (e.g., `Drawer A1`, `Bin 3`) or specify storage locations individually per component.
3. Drag & drop or select photos (up to 50 at once) or snap photos using your device camera.
4. SimVentory automatically analyzes images in the background using your configured Vision model (with backup model failover and RPM limiter).
5. Review generated component attributes (Name, Category, Package, SKU, Specs, Tags) right on the staged cards or click **Fine-tune Details** to customize.
6. Click **Approve & Add** for single items or **Approve All Ready** to commit them into the inventory in one batch.
7. To scan a part barcode or QR label directly when editing an item, click the camera icon next to **Part Number / SKU** in the Add/Edit form.

---

## 📁 Project Structure

```
simventory/
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
