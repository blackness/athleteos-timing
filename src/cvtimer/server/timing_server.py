"""
AthletOS Timing Server
─────────────────────
WebSocket server that receives camera frames from the Expo app,
runs YOLO inference for athlete detection + bib recognition,
and streams timing results back in real-time.

Requirements:
    pip install ultralytics websockets opencv-python-headless numpy

Usage:
    python timing_server.py [--port 8765] [--model yolov8m.pt] [--device cuda]
"""

import asyncio
import json
import time
import base64
import argparse
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional

import cv2
import numpy as np
import websockets
from ultralytics import YOLO

logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger(__name__)


# ─── Configuration ────────────────────────────────────────────────

@dataclass
class TimingConfig:
    # YOLO
    model_path: str = "yolov8m.pt"
    confidence_threshold: float = 0.5
    device: str = "cuda"  # "cuda", "mps", or "cpu"
    
    # Tracking
    tracker: str = "botsort.yaml"  # or "bytetrack.yaml"
    
    # Finish line detection
    # The finish line is defined as a vertical region (percentage of frame width)
    finish_line_x_pct: float = 0.50  # Center of frame
    finish_line_width_pct: float = 0.05  # Width of the detection zone
    
    # Timing
    min_crossing_interval_ms: float = 500  # Debounce — same athlete can't finish twice in 500ms


# ─── Athlete Tracker ──────────────────────────────────────────────

@dataclass
class TrackedAthlete:
    track_id: int
    bib: str = "?"
    last_x: float = 0.0
    last_seen: float = 0.0
    crossed_finish: bool = False
    finish_time: Optional[float] = None
    confidences: list = field(default_factory=list)


# ─── Timing Engine ────────────────────────────────────────────────

class TimingEngine:
    """Core timing logic — detects finish line crossings from YOLO tracks."""
    
    def __init__(self, config: TimingConfig):
        self.config = config
        self.model = YOLO(config.model_path)
        self.athletes: dict[int, TrackedAthlete] = {}
        self.results: list[dict] = []
        self.race_start_time: Optional[float] = None
        self.place_counter = 0
        self.is_timing = False
        
        logger.info(f"YOLO model loaded: {config.model_path} on {config.device}")
    
    def start_race(self, timestamp_ms: int):
        """Reset state and start timing."""
        self.athletes.clear()
        self.results.clear()
        self.place_counter = 0
        self.race_start_time = timestamp_ms / 1000.0
        self.is_timing = True
        logger.info(f"Race started at {self.race_start_time}")
    
    def stop_race(self):
        """Stop timing."""
        self.is_timing = False
        logger.info(f"Race stopped. {len(self.results)} finishers recorded.")
    
    def process_frame(self, frame: np.ndarray, timestamp_ms: int) -> dict:
        """
        Run YOLO detection + tracking on a single frame.
        Returns detections and any new timing results.
        """
        if not self.is_timing:
            return {"detections": [], "new_results": []}
        
        frame_time = timestamp_ms / 1000.0
        h, w = frame.shape[:2]
        
        # ── YOLO Detection + Tracking ──
        results = self.model.track(
            frame,
            persist=True,
            tracker=self.config.tracker,
            conf=self.config.confidence_threshold,
            classes=[0],  # Class 0 = person in COCO
            device=self.config.device,
            verbose=False,
        )
        
        detections = []
        new_results = []
        
        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes
            
            for i in range(len(boxes)):
                # Extract detection data
                box = boxes.xyxy[i].cpu().numpy()
                track_id = int(boxes.id[i].cpu().numpy())
                conf = float(boxes.conf[i].cpu().numpy())
                
                # Normalize bbox to percentages for the overlay
                x1_pct = (box[0] / w) * 100
                y1_pct = (box[1] / h) * 100
                x2_pct = (box[2] / w) * 100
                y2_pct = (box[3] / h) * 100
                
                # Center x of the person (normalized 0-1)
                center_x = ((box[0] + box[2]) / 2) / w
                
                # Update or create tracked athlete
                if track_id not in self.athletes:
                    self.athletes[track_id] = TrackedAthlete(track_id=track_id)
                
                athlete = self.athletes[track_id]
                prev_x = athlete.last_x
                athlete.last_x = center_x
                athlete.last_seen = frame_time
                athlete.confidences.append(conf)
                
                # ── Bib Detection (placeholder) ──
                # In production, crop the detection box and run OCR
                # For now, use track_id as a stand-in
                if athlete.bib == "?":
                    athlete.bib = str(track_id)
                
                # ── Finish Line Crossing Detection ──
                finish_x = self.config.finish_line_x_pct
                zone_half = self.config.finish_line_width_pct / 2
                
                crossed = (
                    not athlete.crossed_finish
                    and prev_x > 0  # Must have a previous position
                    and prev_x < (finish_x - zone_half)  # Was before the line
                    and center_x >= (finish_x - zone_half)  # Now in/past the zone
                )
                
                if crossed:
                    athlete.crossed_finish = True
                    athlete.finish_time = frame_time
                    self.place_counter += 1
                    
                    elapsed = frame_time - self.race_start_time
                    time_str = self._format_time(elapsed)
                    
                    result = {
                        "bib": athlete.bib,
                        "place": self.place_counter,
                        "time": time_str,
                        "elapsed_seconds": round(elapsed, 3),
                        "confidence": round(float(sum(athlete.confidences) / len(athlete.confidences)), 3),
                        "track_id": track_id,
                    }
                    self.results.append(result)
                    new_results.append(result)
                    
                    logger.info(f"🏁 Place {result['place']}: Bib #{result['bib']} — {result['time']}")
                
                detections.append({
                    "bib": athlete.bib,
                    "confidence": round(float(conf), 3),
                    "bbox": [round(float(x1_pct), 1), round(float(y1_pct), 1), round(float(x2_pct), 1), round(float(y2_pct), 1)],
                    "timestamp": timestamp_ms,
                    "trackId": track_id,
                })
        
        return {"detections": detections, "new_results": new_results}
    
    @staticmethod
    def _format_time(seconds: float) -> str:
        """Format elapsed seconds as MM:SS.mmm"""
        mins = int(seconds // 60)
        secs = seconds % 60
        return f"{mins}:{secs:06.3f}"


# ─── WebSocket Server ─────────────────────────────────────────────

class TimingServer:
    """WebSocket server that bridges the Expo app to the YOLO engine."""
    
    def __init__(self, config: TimingConfig, port: int = 8765):
        self.engine = TimingEngine(config)
        self.port = port
        self.clients: set = set()
        self.frame_count = 0
        self.start_time = time.time()
    
    async def handler(self, websocket):
        """Handle a single client connection."""
        self.clients.add(websocket)
        client_id = id(websocket)
        logger.info(f"Client connected: {client_id} (total: {len(self.clients)})")
        
        try:
            async for message in websocket:
                await self._process_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            logger.info(f"Client disconnected: {client_id}")
    
    async def _process_message(self, websocket, raw_message: str):
        """Route incoming messages from the Expo app."""
        try:
            msg = json.loads(raw_message)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({"type": "error", "data": "Invalid JSON"}))
            return
        
        msg_type = msg.get("type")
        
        if msg_type == "config":
            logger.info(f"Client config: mode={msg.get('mode')}, width={msg.get('captureWidth')}")
        
        elif msg_type == "command":
            action = msg.get("action")
            if action == "start_timing":
                self.engine.start_race(msg.get("timestamp", int(time.time() * 1000)))
                await self._broadcast({"type": "status", "data": "timing_started"})
            elif action == "stop_timing":
                self.engine.stop_race()
                await self._broadcast({
                    "type": "status",
                    "data": "timing_stopped",
                    "results": self.engine.results,
                })
        
        elif msg_type == "frame":
            await self._process_frame(websocket, msg)
    
    async def _process_frame(self, websocket, msg: dict):
        """Decode a base64 frame, run YOLO, and send results back."""
        try:
            # Decode base64 image
            img_bytes = base64.b64decode(msg["image"])
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                return
            
            timestamp = msg.get("timestamp", int(time.time() * 1000))
            
            # Run inference
            result = self.engine.process_frame(frame, timestamp)
            
            self.frame_count += 1
            
            # Send detections back to the requesting client
            if result["detections"]:
                await websocket.send(json.dumps({
                    "type": "detection",
                    "data": result["detections"],
                }))
            
            # Broadcast new timing results to ALL clients
            for new_result in result["new_results"]:
                await self._broadcast({
                    "type": "timing_result",
                    "data": new_result,
                })
        
        except Exception as e:
            logger.error(f"Frame processing error: {e}")
    
    async def _broadcast(self, message: dict):
        """Send a message to all connected clients."""
        if not self.clients:
            return
        data = json.dumps(message)
        await asyncio.gather(
            *[client.send(data) for client in self.clients],
            return_exceptions=True,
        )
    
    async def run(self):
        """Start the WebSocket server."""
        logger.info(f"AthletOS Timing Server starting on ws://0.0.0.0:{self.port}")
        logger.info(f"Model: {self.engine.config.model_path} | Device: {self.engine.config.device}")
        logger.info("Waiting for Expo app to connect...")
        
        async with websockets.serve(self.handler, "0.0.0.0", self.port):
            await asyncio.Future()  # Run forever


# ─── Entry Point ──────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AthletOS YOLO Timing Server")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket port")
    parser.add_argument("--model", type=str, default="yolov8m.pt", help="YOLO model path")
    parser.add_argument("--device", type=str, default="cuda", help="Inference device: cuda, mps, cpu")
    parser.add_argument("--confidence", type=float, default=0.5, help="Detection confidence threshold")
    parser.add_argument("--tracker", type=str, default="botsort.yaml", help="Tracker config")
    parser.add_argument("--finish-line", type=float, default=0.5, help="Finish line position (0-1)")
    args = parser.parse_args()
    
    config = TimingConfig(
        model_path=args.model,
        device=args.device,
        confidence_threshold=args.confidence,
        tracker=args.tracker,
        finish_line_x_pct=args.finish_line,
    )
    
    server = TimingServer(config, port=args.port)
    asyncio.run(server.run())


if __name__ == "__main__":
    main()
