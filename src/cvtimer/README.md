# AthletOS Timer — Expo + YOLO Integration

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────────┐
│  iPhone (Expo)   │ ──── frames ────▶ │  Timing Server (PC)  │
│                  │                    │                      │
│  • expo-camera   │ ◀── detections ── │  • YOLOv8 inference  │
│  • frame capture │ ◀── results ───── │  • BoT-SORT tracking │
│  • result display│                    │  • Finish line logic │
└─────────────────┘                    └──────────────────────┘
                                                │
                                                ▼
                                       ┌──────────────────┐
                                       │  AthletOS Cloud   │
                                       │  (future: API +   │
                                       │   live dashboard)  │
                                       └──────────────────┘
```

## Quick Start

### 1. Server Setup (your laptop/PC)

```bash
cd server
pip install -r requirements.txt
python timing_server.py --device cpu    # or cuda/mps
```

The server starts on `ws://0.0.0.0:8765`. Note your machine's local IP (e.g., `192.168.1.100`).

### 2. Expo App Setup (your iPhone)

```bash
# In the project root
npx create-expo-app@latest athleteos-timer --template blank-typescript
cd athleteos-timer

# Install dependencies
npx expo install expo-camera expo-image-manipulator

# Copy App.tsx from this repo into the new project
# Update CONFIG.WS_URL to your server's IP:
#   WS_URL: 'ws://192.168.1.100:8765'

# Run on your iPhone
npx expo start
# Scan the QR code with Expo Go, or press 'i' for iOS simulator
```

### 3. Connect & Time

1. Open the app on your iPhone
2. Tap **Connect to Server**
3. Select a timing mode (Finish Line, Checkpoint, etc.)
4. Point the camera at your timing zone
5. Tap **START TIMING**
6. Athletes crossing the finish line will be detected and timed automatically

## Timing Modes

| Mode | Use Case | How It Works |
|------|----------|--------------|
| **Finish Line** | Sprint, XC, road race | Detects when tracked athletes cross a vertical line |
| **Checkpoint** | Course splits, aid stations | Logs athlete passage at a fixed point |
| **Lap Timing** | Track, cycling | Counts and times each crossing |
| **Multi Split** | Interval training | Multiple timing zones in one view |

## Configuration

### Server (`timing_server.py`)

```bash
python timing_server.py \
  --model yolov8m.pt \      # YOLO model (m = medium, good balance)
  --device cuda \            # cuda, mps (Mac), or cpu
  --confidence 0.5 \         # Detection threshold
  --tracker botsort.yaml \   # BoT-SORT (best) or bytetrack.yaml (faster)
  --finish-line 0.5 \        # Finish line position (0=left, 1=right)
  --port 8765
```

### Expo App (`CONFIG` in App.tsx)

```typescript
const CONFIG = {
  WS_URL: 'ws://192.168.1.100:8765',  // Your server IP
  CAPTURE_INTERVAL_MS: 100,             // 10 FPS (lower = less bandwidth)
  CAPTURE_QUALITY: 0.6,                 // JPEG quality
  CAPTURE_WIDTH: 640,                   // Frame width sent to server
};
```

## Performance Tuning

| Setting | Low-end Laptop | Gaming Laptop | Jetson Orin |
|---------|---------------|---------------|-------------|
| Model | yolov8n.pt | yolov8m.pt | yolov8m.pt |
| Device | cpu | cuda | cuda |
| FPS target | 5-8 | 15-30 | 20-30 |
| CAPTURE_INTERVAL_MS | 200 | 66 | 66 |
| CAPTURE_WIDTH | 480 | 640 | 640 |

## Network Requirements

Both devices must be on the **same WiFi network**. For race-day reliability:

1. **Bring a dedicated router** — don't rely on venue WiFi
2. **Use 5GHz band** for lower latency
3. **Consider USB-C tethering** as a backup (Expo supports it)
4. **For remote checkpoints**: Use cellular + cloud relay (Phase 2)

## Next Steps

- [ ] **Bib OCR**: Integrate PaddleOCR or EasyOCR for automatic bib reading
- [ ] **On-device inference**: Export YOLO to CoreML, run on iPhone Neural Engine
- [ ] **Cloud relay**: For checkpoint mode across cellular connections
- [ ] **Dashboard bridge**: Connect to the AthletOS live results dashboard
- [ ] **RunSignup integration**: Auto-match bibs to registered athletes
