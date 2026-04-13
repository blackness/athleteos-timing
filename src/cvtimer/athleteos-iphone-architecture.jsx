import { useState } from "react";

const COLORS = {
  bg: "#08080e",
  surface: "#0f1018",
  surfaceHover: "#161822",
  border: "#1c1e2e",
  accent: "#00ff88",
  accentDim: "#00ff8830",
  red: "#ff4455",
  blue: "#4488ff",
  purple: "#aa66ff",
  orange: "#ff8844",
  yellow: "#ffcc00",
  text: "#e8e8f0",
  textMuted: "#666680",
  textDim: "#444460",
};

const PHASES = [
  {
    id: "phase1",
    title: "Phase 1: Server-Side",
    subtitle: "Ship in days",
    color: COLORS.accent,
    status: "BUILD NOW",
    description: "iPhone streams frames → your laptop runs YOLO → results stream back. Works today with your crappy laptop.",
    latency: "100-200ms",
    accuracy: "High (full YOLOv8m)",
    complexity: "Low",
    nodes: [
      { id: "iphone", label: "iPhone\n(Expo Camera)", x: 8, y: 35, w: 16, h: 14, color: COLORS.blue },
      { id: "ws", label: "WebSocket\n(WiFi)", x: 30, y: 38, w: 12, h: 8, color: COLORS.textDim, small: true },
      { id: "server", label: "Laptop / PC\nYOLO + Tracking", x: 48, y: 35, w: 18, h: 14, color: COLORS.accent },
      { id: "results", label: "Live Results\nDashboard", x: 76, y: 35, w: 16, h: 14, color: COLORS.purple },
    ],
    arrows: [
      { from: "iphone", to: "ws", label: "JPEG frames\n10 FPS" },
      { from: "ws", to: "server", label: "" },
      { from: "server", to: "results", label: "detections\n+ timing" },
      { from: "server", to: "iphone", label: "bounding boxes", reverse: true },
    ],
  },
  {
    id: "phase2",
    title: "Phase 2: On-Device",
    subtitle: "Ship in weeks",
    color: COLORS.orange,
    status: "NEXT",
    description: "Export YOLO to CoreML → runs on iPhone Neural Engine directly. Zero network latency for detection.",
    latency: "15-30ms",
    accuracy: "Good (YOLOv8n-CoreML)",
    complexity: "Medium",
    nodes: [
      { id: "iphone2", label: "iPhone\nCamera + CoreML\nYOLO on Neural Engine", x: 8, y: 32, w: 22, h: 18, color: COLORS.orange },
      { id: "api", label: "AthletOS\nCloud API", x: 42, y: 35, w: 16, h: 14, color: COLORS.blue },
      { id: "dash2", label: "Live Results\nDashboard", x: 68, y: 28, w: 16, h: 14, color: COLORS.purple },
      { id: "db", label: "Results DB\n+ Analytics", x: 68, y: 48, w: 16, h: 14, color: COLORS.accent },
    ],
    arrows: [
      { from: "iphone2", to: "api", label: "timing events\n(not frames)" },
      { from: "api", to: "dash2", label: "WebSocket\nreal-time" },
      { from: "api", to: "db", label: "persist" },
    ],
  },
  {
    id: "phase3",
    title: "Phase 3: Hybrid Fleet",
    subtitle: "Scale to events",
    color: COLORS.purple,
    status: "LATER",
    description: "Multiple iPhones at checkpoints + edge devices at finish. Full course coverage with mesh coordination.",
    latency: "15-50ms",
    accuracy: "Highest (ensemble)",
    complexity: "High",
    nodes: [
      { id: "finish", label: "Finish Line\nJetson + Cameras", x: 5, y: 28, w: 17, h: 14, color: COLORS.accent },
      { id: "cp1", label: "Checkpoint 1\niPhone", x: 5, y: 50, w: 14, h: 12, color: COLORS.blue },
      { id: "cp2", label: "Checkpoint 2\niPhone", x: 22, y: 50, w: 14, h: 12, color: COLORS.blue },
      { id: "cloud", label: "AthletOS\nCloud Coordinator", x: 42, y: 35, w: 18, h: 14, color: COLORS.purple },
      { id: "live", label: "Spectator\nLeaderboard", x: 70, y: 25, w: 16, h: 12, color: COLORS.orange },
      { id: "coach", label: "Coach\nDashboard", x: 70, y: 42, w: 16, h: 12, color: COLORS.orange },
      { id: "athlete", label: "Athlete\nApp", x: 70, y: 58, w: 16, h: 12, color: COLORS.orange },
    ],
    arrows: [
      { from: "finish", to: "cloud", label: "results" },
      { from: "cp1", to: "cloud", label: "splits" },
      { from: "cp2", to: "cloud", label: "splits" },
      { from: "cloud", to: "live", label: "" },
      { from: "cloud", to: "coach", label: "" },
      { from: "cloud", to: "athlete", label: "" },
    ],
  },
];

const CODE_SNIPPETS = {
  expo_capture: `// Expo: Capture & stream frames
const captureAndSend = async () => {
  const photo = await cameraRef.current
    .takePictureAsync({ base64: true });
  
  const resized = await ImageManipulator
    .manipulateAsync(photo.uri,
      [{ resize: { width: 640 } }],
      { compress: 0.6, base64: true }
    );
  
  ws.send(JSON.stringify({
    type: 'frame',
    timestamp: Date.now(),
    image: resized.base64,
  }));
};`,
  server_yolo: `# Server: YOLO detection + timing
results = model.track(
    frame,
    persist=True,
    tracker="botsort.yaml",
    conf=0.5,
    classes=[0],  # person
)

# Check finish line crossing
for track in results:
    if crossed_finish_line(track):
        elapsed = time.time() - race_start
        broadcast({
            "bib": track.bib,
            "place": place_counter,
            "time": format_time(elapsed),
        })`,
  coreml_export: `# Export YOLO to CoreML for iPhone
from ultralytics import YOLO

model = YOLO("yolov8n.pt")
model.export(
    format="coreml",
    nms=True,        # Include NMS in model
    imgsz=640,
    half=True,       # FP16 for Neural Engine
)
# Output: yolov8n.mlpackage
# → Add to Xcode project
# → Runs on Neural Engine at 30+ FPS`,
};

function PhaseCard({ phase, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: isActive ? `${phase.color}12` : COLORS.surface,
        border: `1.5px solid ${isActive ? phase.color : COLORS.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.2s",
        outline: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: phase.color, fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {phase.title}
        </span>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: isActive ? "#000" : phase.color,
          background: isActive ? phase.color : `${phase.color}20`,
          padding: "2px 7px",
          borderRadius: 4,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {phase.status}
        </span>
      </div>
      <div style={{ color: COLORS.textMuted, fontSize: 11 }}>{phase.subtitle}</div>
    </button>
  );
}

function ArchDiagram({ phase }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: 200,
      background: `${COLORS.surface}`,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Grid lines */}
      <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={COLORS.border} strokeWidth="0.5" opacity="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Arrows */}
        {phase.arrows.map((arrow, i) => {
          const fromNode = phase.nodes.find(n => n.id === arrow.from);
          const toNode = phase.nodes.find(n => n.id === arrow.to);
          if (!fromNode || !toNode) return null;
          const x1 = fromNode.x + fromNode.w / 2;
          const y1 = fromNode.y + fromNode.h / 2;
          const x2 = toNode.x + toNode.w / 2;
          const y2 = toNode.y + toNode.h / 2;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line
                x1={`${x1}%`} y1={`${y1}%`}
                x2={`${x2}%`} y2={`${y2}%`}
                stroke={COLORS.accent}
                strokeWidth="1.5"
                strokeDasharray={arrow.reverse ? "4,4" : "none"}
                opacity="0.5"
              />
              {arrow.label && (
                <text
                  x={`${midX}%`}
                  y={`${midY - 3}%`}
                  fill={COLORS.textMuted}
                  fontSize="8"
                  textAnchor="middle"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {arrow.label.split("\n").map((line, j) => (
                    <tspan key={j} x={`${midX}%`} dy={j === 0 ? 0 : 10}>{line}</tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {phase.nodes.map(node => (
        <div
          key={node.id}
          style={{
            position: "absolute",
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: `${node.w}%`,
            height: `${node.h}%`,
            background: `${node.color}15`,
            border: `1.5px solid ${node.color}60`,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
          }}
        >
          <span style={{
            color: node.color,
            fontSize: node.small ? 8 : 10,
            fontWeight: 600,
            textAlign: "center",
            lineHeight: 1.3,
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: "pre-line",
          }}>
            {node.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function CodeBlock({ code, title }) {
  return (
    <div style={{
      background: "#0c0c14",
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      overflow: "hidden",
      flex: 1,
      minWidth: 240,
    }}>
      <div style={{
        padding: "6px 10px",
        background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.red }} />
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.yellow }} />
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.accent }} />
        <span style={{ color: COLORS.textMuted, fontSize: 10, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>
          {title}
        </span>
      </div>
      <pre style={{
        padding: 10,
        margin: 0,
        fontSize: 10,
        lineHeight: 1.5,
        color: COLORS.text,
        fontFamily: "'JetBrains Mono', monospace",
        overflowX: "auto",
        whiteSpace: "pre",
      }}>
        {code}
      </pre>
    </div>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: 6,
      padding: "6px 12px",
      textAlign: "center",
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

export default function AthletOSArchitecture() {
  const [activePhase, setActivePhase] = useState(0);
  const [activeCode, setActiveCode] = useState("expo_capture");
  const phase = PHASES[activePhase];

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      padding: 20,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace" }}>
            AthletOS
          </span>
          <span style={{ fontSize: 22, fontWeight: 300, color: COLORS.textMuted }}>×</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.text }}>iPhone + YOLO</span>
        </div>
        <p style={{ color: COLORS.textMuted, fontSize: 13, margin: 0 }}>
          Expo camera → YOLO inference → real-time athlete timing
        </p>
      </div>

      {/* Phase selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {PHASES.map((p, i) => (
          <PhaseCard key={p.id} phase={p} isActive={i === activePhase} onClick={() => setActivePhase(i)} />
        ))}
      </div>

      {/* Architecture diagram */}
      <ArchDiagram phase={phase} />

      {/* Phase details */}
      <div style={{
        display: "flex",
        gap: 12,
        marginTop: 12,
        marginBottom: 16,
      }}>
        <div style={{ flex: 2, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}`, padding: 14 }}>
          <p style={{ color: COLORS.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            {phase.description}
          </p>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <StatBadge label="Latency" value={phase.latency} color={phase.color} />
          <StatBadge label="Accuracy" value={phase.accuracy} color={COLORS.blue} />
          <StatBadge label="Complexity" value={phase.complexity} color={COLORS.purple} />
        </div>
      </div>

      {/* Code tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[
          { key: "expo_capture", label: "Expo Capture" },
          { key: "server_yolo", label: "Server YOLO" },
          { key: "coreml_export", label: "CoreML Export" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveCode(tab.key)}
            style={{
              background: activeCode === tab.key ? COLORS.accentDim : "transparent",
              border: `1px solid ${activeCode === tab.key ? COLORS.accent : COLORS.border}`,
              borderRadius: 6,
              padding: "5px 12px",
              color: activeCode === tab.key ? COLORS.accent : COLORS.textMuted,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <CodeBlock
        code={CODE_SNIPPETS[activeCode]}
        title={activeCode === "expo_capture" ? "App.tsx" : activeCode === "server_yolo" ? "timing_server.py" : "export_model.py"}
      />

      {/* Quick start */}
      <div style={{
        marginTop: 16,
        background: `${COLORS.accent}08`,
        border: `1px solid ${COLORS.accent}20`,
        borderRadius: 8,
        padding: 14,
      }}>
        <div style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
          → GET RUNNING IN 5 MIN
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { step: "1", text: "pip install ultralytics websockets" },
            { step: "2", text: "python timing_server.py --device cpu" },
            { step: "3", text: "npx expo start → scan QR on iPhone" },
            { step: "4", text: "Tap Connect → START TIMING" },
          ].map(s => (
            <div key={s.step} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%",
                background: COLORS.accent, color: "#000",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, flexShrink: 0,
              }}>
                {s.step}
              </span>
              <code style={{ color: COLORS.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                {s.text}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
