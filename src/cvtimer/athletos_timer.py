"""
AthletOS Finish Line Timing — MVP Prototype
=============================================
Run this at a training run with a laptop + USB camera (or webcam).

SETUP:
  pip install ultralytics opencv-python-headless pandas

USAGE:
  python athletos_timer.py                        # webcam
  python athletos_timer.py --source video.mp4     # recorded video
  python athletos_timer.py --source 0 --cam-id A  # camera A (primary)

CONTROLS (while running):
  's'  = Set/move the virtual finish line (click two points)
  'r'  = Reset results
  'q'  = Quit and save results to CSV
  'p'  = Pause/resume
  'f'  = Toggle form analysis overlay

OUTPUT:
  results_{timestamp}.csv — bib-less results with track IDs and timestamps
  form_{timestamp}.csv   — pose keypoint data per runner per sighting
"""

import argparse
import time
import csv
import os
from datetime import datetime
from collections import defaultdict

import cv2
import numpy as np

# ─── Try importing ultralytics; provide clear error if missing ───
try:
    from ultralytics import YOLO
except ImportError:
    print("\n[ERROR] ultralytics not installed.")
    print("Run:  pip install ultralytics opencv-python-headless pandas\n")
    exit(1)


# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

DEFAULT_MODEL = "yolo11n-pose.pt"  # lightweight pose model; upgrade to yolo11m-pose.pt for accuracy
CONFIDENCE_THRESHOLD = 0.5
TRACKER = "botsort.yaml"  # or "bytetrack.yaml"
FINISH_LINE_COLOR = (0, 255, 130)
DETECTION_BOX_COLOR = (255, 180, 0)
FORM_OVERLAY_COLOR = (130, 255, 255)

# COCO pose keypoint indices
KP_NOSE = 0
KP_L_SHOULDER = 5
KP_R_SHOULDER = 6
KP_L_HIP = 11
KP_R_HIP = 12
KP_L_KNEE = 13
KP_R_KNEE = 14
KP_L_ANKLE = 15
KP_R_ANKLE = 16

# Skeleton connections for drawing
SKELETON = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12), (11, 13), (13, 15),
    (12, 14), (14, 16)
]


# ═══════════════════════════════════════════════════════════════════
# FINISH LINE GEOMETRY
# ═══════════════════════════════════════════════════════════════════

class FinishLine:
    """Virtual finish line defined by two points on the frame."""
    
    def __init__(self, frame_width, frame_height):
        # Default: vertical line at 75% of frame width
        x = int(frame_width * 0.75)
        self.pt1 = (x, 0)
        self.pt2 = (x, frame_height)
        self.frame_w = frame_width
        self.frame_h = frame_height
    
    def set_points(self, pt1, pt2):
        self.pt1 = pt1
        self.pt2 = pt2
    
    def draw(self, frame):
        cv2.line(frame, self.pt1, self.pt2, FINISH_LINE_COLOR, 2, cv2.LINE_AA)
        # Label
        mid_y = (self.pt1[1] + self.pt2[1]) // 2
        mid_x = (self.pt1[0] + self.pt2[0]) // 2
        cv2.putText(frame, "FINISH", (mid_x - 30, mid_y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, FINISH_LINE_COLOR, 2)
    
    def crossed(self, prev_x, curr_x):
        """Check if a runner crossed the finish line (left to right)."""
        line_x = self.pt1[0]  # simplified for vertical line
        return prev_x < line_x <= curr_x


# ═══════════════════════════════════════════════════════════════════
# FORM ANALYSIS
# ═══════════════════════════════════════════════════════════════════

class FormAnalyzer:
    """Extract running form metrics from YOLO-pose keypoints."""
    
    @staticmethod
    def compute_metrics(keypoints, conf):
        """
        Given 17 COCO keypoints, compute running form metrics.
        Returns dict of metrics or None if insufficient keypoints.
        """
        metrics = {}
        kp = keypoints  # shape: (17, 2)
        kc = conf       # shape: (17,)
        
        # Need shoulders and hips with decent confidence
        if kc[KP_L_SHOULDER] < 0.3 or kc[KP_R_SHOULDER] < 0.3:
            return None
        if kc[KP_L_HIP] < 0.3 or kc[KP_R_HIP] < 0.3:
            return None
        
        # Trunk angle (forward lean)
        # Vector from mid-hip to mid-shoulder
        mid_shoulder = (kp[KP_L_SHOULDER] + kp[KP_R_SHOULDER]) / 2
        mid_hip = (kp[KP_L_HIP] + kp[KP_R_HIP]) / 2
        trunk_vec = mid_shoulder - mid_hip
        # Angle from vertical (positive = forward lean)
        vertical = np.array([0, -1])  # up in image coords
        cos_angle = np.dot(trunk_vec, vertical) / (np.linalg.norm(trunk_vec) * np.linalg.norm(vertical) + 1e-6)
        trunk_angle = np.degrees(np.arccos(np.clip(cos_angle, -1, 1)))
        # Determine sign: positive if leaning forward (shoulder x > hip x when running right)
        if trunk_vec[0] > 0:
            trunk_angle = trunk_angle
        else:
            trunk_angle = -trunk_angle
        metrics['trunk_angle'] = round(trunk_angle, 1)
        
        # Vertical oscillation proxy: hip height (lower = more bounce in video coords)
        metrics['hip_height'] = round(float(mid_hip[1]), 1)
        
        # Shoulder-hip alignment (lateral lean)
        shoulder_diff = abs(kp[KP_L_SHOULDER][1] - kp[KP_R_SHOULDER][1])
        hip_diff = abs(kp[KP_L_HIP][1] - kp[KP_R_HIP][1])
        metrics['shoulder_tilt'] = round(float(shoulder_diff), 1)
        metrics['hip_tilt'] = round(float(hip_diff), 1)
        
        # Knee lift (if visible)
        if kc[KP_L_KNEE] > 0.3 and kc[KP_R_KNEE] > 0.3:
            l_knee_lift = mid_hip[1] - kp[KP_L_KNEE][1]  # positive = knee above hip line
            r_knee_lift = mid_hip[1] - kp[KP_R_KNEE][1]
            metrics['max_knee_lift'] = round(float(max(l_knee_lift, r_knee_lift)), 1)
        
        # Stride width (if ankles visible)
        if kc[KP_L_ANKLE] > 0.3 and kc[KP_R_ANKLE] > 0.3:
            stride_w = abs(kp[KP_L_ANKLE][0] - kp[KP_R_ANKLE][0])
            metrics['stride_width'] = round(float(stride_w), 1)
        
        return metrics
    
    @staticmethod
    def draw_skeleton(frame, keypoints, conf, color=FORM_OVERLAY_COLOR):
        """Draw pose skeleton on frame."""
        kp = keypoints
        kc = conf
        
        # Draw keypoints
        for i in range(len(kp)):
            if kc[i] > 0.3:
                x, y = int(kp[i][0]), int(kp[i][1])
                cv2.circle(frame, (x, y), 4, color, -1)
        
        # Draw skeleton connections
        for (i, j) in SKELETON:
            if kc[i] > 0.3 and kc[j] > 0.3:
                pt1 = (int(kp[i][0]), int(kp[i][1]))
                pt2 = (int(kp[j][0]), int(kp[j][1]))
                cv2.line(frame, pt1, pt2, color, 2, cv2.LINE_AA)


# ═══════════════════════════════════════════════════════════════════
# MAIN TIMING ENGINE
# ═══════════════════════════════════════════════════════════════════

class AthletOSTimer:
    
    def __init__(self, source, model_path, cam_id="A", show_form=True):
        self.source = source
        self.cam_id = cam_id
        self.show_form = show_form
        
        print(f"[AthletOS] Loading model: {model_path}")
        self.model = YOLO(model_path)
        
        print(f"[AthletOS] Opening video source: {source}")
        self.cap = cv2.VideoCapture(int(source) if str(source).isdigit() else source)
        
        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open video source: {source}")
        
        self.frame_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.frame_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        
        print(f"[AthletOS] Frame: {self.frame_w}x{self.frame_h} @ {self.fps:.1f}fps")
        
        # Finish line
        self.finish_line = FinishLine(self.frame_w, self.frame_h)
        
        # Form analyzer
        self.form_analyzer = FormAnalyzer()
        
        # Tracking state
        self.prev_positions = {}   # track_id -> previous x center
        self.finish_results = []   # list of dicts
        self.finished_ids = set()  # track IDs that already crossed
        self.form_data = []        # form metrics per sighting
        
        # Timing
        self.race_start_time = None
        self.frame_count = 0
        self.paused = False
        
        # Stats
        self.active_detections = 0
        
        print(f"[AthletOS] Ready. Press 's' to start race timer.")
        print(f"[AthletOS] Finish line at x={self.finish_line.pt1[0]}")
    
    def run(self):
        """Main loop."""
        while True:
            if self.paused:
                key = cv2.waitKey(100) & 0xFF
                if key == ord('p'):
                    self.paused = False
                elif key == ord('q'):
                    break
                continue
            
            ret, frame = self.cap.read()
            if not ret:
                print("[AthletOS] End of video stream.")
                break
            
            self.frame_count += 1
            
            # Run YOLO tracking with pose
            results = self.model.track(
                frame,
                persist=True,
                tracker=TRACKER,
                conf=CONFIDENCE_THRESHOLD,
                verbose=False
            )
            
            # Process results
            annotated = frame.copy()
            self.active_detections = 0
            
            if results and results[0].boxes is not None and results[0].boxes.id is not None:
                boxes = results[0].boxes
                track_ids = boxes.id.int().cpu().tolist()
                xyxy = boxes.xyxy.cpu().numpy()
                confs = boxes.conf.cpu().numpy()
                
                # Get keypoints if available
                has_keypoints = (results[0].keypoints is not None)
                if has_keypoints:
                    kp_xy = results[0].keypoints.xy.cpu().numpy()
                    kp_conf = results[0].keypoints.conf.cpu().numpy()
                
                for i, track_id in enumerate(track_ids):
                    self.active_detections += 1
                    x1, y1, x2, y2 = xyxy[i]
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    conf = confs[i]
                    
                    # Draw detection box
                    cv2.rectangle(annotated,
                                  (int(x1), int(y1)), (int(x2), int(y2)),
                                  DETECTION_BOX_COLOR, 2)
                    label = f"ID:{track_id} {conf:.0%}"
                    cv2.putText(annotated, label,
                                (int(x1), int(y1) - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                                DETECTION_BOX_COLOR, 1)
                    
                    # Form analysis
                    if has_keypoints and self.show_form:
                        keypoints = kp_xy[i]
                        keyconf = kp_conf[i]
                        
                        # Draw skeleton
                        self.form_analyzer.draw_skeleton(annotated, keypoints, keyconf)
                        
                        # Compute metrics
                        metrics = self.form_analyzer.compute_metrics(keypoints, keyconf)
                        if metrics:
                            # Display trunk angle
                            ta = metrics.get('trunk_angle', 0)
                            ta_color = (0, 255, 0) if abs(ta) > 3 else (0, 200, 255)
                            cv2.putText(annotated,
                                        f"Lean:{ta:.0f}deg",
                                        (int(x1), int(y2) + 16),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                                        ta_color, 1)
                            
                            # Store form data
                            self.form_data.append({
                                'frame': self.frame_count,
                                'track_id': track_id,
                                'elapsed': self._elapsed(),
                                'cam': self.cam_id,
                                **metrics
                            })
                    
                    # Finish line crossing detection
                    if track_id in self.prev_positions and track_id not in self.finished_ids:
                        prev_x = self.prev_positions[track_id]
                        if self.finish_line.crossed(prev_x, cx):
                            elapsed = self._elapsed()
                            place = len(self.finish_results) + 1
                            
                            result = {
                                'place': place,
                                'track_id': track_id,
                                'time': elapsed,
                                'time_fmt': self._format_time(elapsed),
                                'confidence': f"{conf:.2f}",
                                'frame': self.frame_count,
                                'cam': self.cam_id,
                            }
                            self.finish_results.append(result)
                            self.finished_ids.add(track_id)
                            
                            print(f"  [FINISH] #{place} | ID:{track_id} | "
                                  f"Time: {result['time_fmt']} | Conf: {conf:.0%}")
                            
                            # Flash green on crossing
                            cv2.rectangle(annotated,
                                          (int(x1), int(y1)), (int(x2), int(y2)),
                                          (0, 255, 0), 4)
                    
                    self.prev_positions[track_id] = cx
            
            # Draw finish line
            self.finish_line.draw(annotated)
            
            # Draw HUD
            self._draw_hud(annotated)
            
            # Show
            cv2.imshow("AthletOS Timer", annotated)
            
            # Handle keys
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('s'):
                self.race_start_time = time.time()
                print(f"\n[AthletOS] *** RACE STARTED at {datetime.now().strftime('%H:%M:%S.%f')[:-3]} ***\n")
            elif key == ord('r'):
                self.finish_results.clear()
                self.finished_ids.clear()
                self.prev_positions.clear()
                self.form_data.clear()
                self.race_start_time = None
                print("[AthletOS] Results reset.")
            elif key == ord('p'):
                self.paused = True
                print("[AthletOS] Paused. Press 'p' to resume.")
            elif key == ord('f'):
                self.show_form = not self.show_form
                print(f"[AthletOS] Form overlay: {'ON' if self.show_form else 'OFF'}")
        
        # Cleanup
        self.cap.release()
        cv2.destroyAllWindows()
        
        # Save results
        self._save_results()
    
    def _elapsed(self):
        if self.race_start_time is None:
            return 0.0
        return time.time() - self.race_start_time
    
    def _format_time(self, seconds):
        if seconds <= 0:
            return "00:00.000"
        mins = int(seconds // 60)
        secs = seconds % 60
        return f"{mins:02d}:{secs:06.3f}"
    
    def _draw_hud(self, frame):
        """Draw heads-up display."""
        h = self.frame_h
        
        # Background bar
        cv2.rectangle(frame, (0, 0), (self.frame_w, 36), (0, 0, 0), -1)
        
        # Race time
        elapsed = self._elapsed()
        if self.race_start_time:
            time_str = f"RACE: {self._format_time(elapsed)}"
            color = (0, 255, 130)
        else:
            time_str = "RACE: NOT STARTED (press 's')"
            color = (100, 100, 255)
        cv2.putText(frame, time_str, (10, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
        
        # Detection count
        det_str = f"Tracking: {self.active_detections}"
        cv2.putText(frame, det_str, (self.frame_w - 200, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        
        # Finisher count
        fin_str = f"Finished: {len(self.finish_results)}"
        cv2.putText(frame, fin_str, (self.frame_w // 2 - 60, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, FINISH_LINE_COLOR, 2)
        
        # Recent finishers (bottom of screen)
        recent = self.finish_results[-5:]
        for i, r in enumerate(reversed(recent)):
            y = h - 20 - (i * 22)
            txt = f"#{r['place']} ID:{r['track_id']} {r['time_fmt']}"
            cv2.putText(frame, txt, (10, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Camera ID
        cv2.putText(frame, f"CAM {self.cam_id}", (self.frame_w - 80, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 100, 100), 1)
    
    def _save_results(self):
        """Save results and form data to CSV."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if self.finish_results:
            results_file = f"results_{timestamp}.csv"
            with open(results_file, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=self.finish_results[0].keys())
                writer.writeheader()
                writer.writerows(self.finish_results)
            print(f"\n[AthletOS] Results saved: {results_file}")
            print(f"[AthletOS] Total finishers: {len(self.finish_results)}")
        
        if self.form_data:
            form_file = f"form_{timestamp}.csv"
            # Get all unique keys across form data entries
            all_keys = set()
            for d in self.form_data:
                all_keys.update(d.keys())
            with open(form_file, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=sorted(all_keys))
                writer.writeheader()
                writer.writerows(self.form_data)
            print(f"[AthletOS] Form data saved: {form_file}")
            print(f"[AthletOS] Form samples: {len(self.form_data)}")
        
        if not self.finish_results and not self.form_data:
            print("\n[AthletOS] No results to save.")


# ═══════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AthletOS Finish Line Timer")
    parser.add_argument("--source", default="0",
                        help="Video source: 0 for webcam, or path to video file")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=f"YOLO model to use (default: {DEFAULT_MODEL})")
    parser.add_argument("--cam-id", default="A",
                        help="Camera identifier (A, B, etc.)")
    parser.add_argument("--no-form", action="store_true",
                        help="Disable form analysis overlay")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("  AthletOS Finish Line Timer — MVP Prototype")
    print("=" * 60)
    print()
    print("  CONTROLS:")
    print("    's' = Start race timer")
    print("    'q' = Quit and save results")
    print("    'r' = Reset all results")
    print("    'p' = Pause/resume")
    print("    'f' = Toggle form analysis overlay")
    print()
    
    timer = AthletOSTimer(
        source=args.source,
        model_path=args.model,
        cam_id=args.cam_id,
        show_form=not args.no_form,
    )
    timer.run()
