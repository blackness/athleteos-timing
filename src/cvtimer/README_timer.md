# AthletOS Finish Line Timer — MVP Prototype

## What This Is

A working finish line timing system using YOLO pose estimation. Point a camera at a finish line, press 's' to start the race, and it automatically detects runners crossing, assigns times, and captures running form data.

**This is your proof-of-concept.** Test it at training runs, collect data, find the failure modes, then iterate.

## Quick Start (5 Minutes)

### 1. Install dependencies

```bash
pip install ultralytics opencv-python pandas
```

The YOLO model weights download automatically on first run (~6MB for nano).

### 2. Run with your webcam

```bash
python athletos_timer.py
```

### 3. Run with a recorded video

```bash
python athletos_timer.py --source race_video.mp4
```

### 4. Run with a USB camera

```bash
python athletos_timer.py --source 0 --cam-id A    # first camera
python athletos_timer.py --source 1 --cam-id B    # second camera (separate terminal)
```

## Controls

| Key | Action |
|-----|--------|
| `s` | Start race timer (press when first runner approaches) |
| `q` | Quit and save results to CSV |
| `r` | Reset all results |
| `p` | Pause / resume |
| `f` | Toggle form analysis overlay on/off |

## Output Files

After you quit (`q`), the system saves:

- `results_YYYYMMDD_HHMMSS.csv` — finish order with track IDs and timestamps
- `form_YYYYMMDD_HHMMSS.csv` — pose keypoint metrics per runner per frame

## Hardware for Training Run Testing

### Minimum (what you probably already have)
- Any laptop with a webcam
- Works on CPU (slower, ~5-10 fps)
- Good enough to validate the concept

### Recommended for real testing
- Laptop with an NVIDIA GPU (any recent — GTX 1060+, RTX series)
- USB webcam (Logitech C920 or similar, $50-70)
- Small tripod or clamp mount ($15-20)
- Total additional cost: ~$70-90

### Target race-day setup
- 2x USB cameras (one front-facing for bib, one angled)
- NVIDIA Jetson Orin Nano ($250) or laptop with GPU
- Weatherproof enclosure for outdoor use
- Battery pack or access to AC power

## Testing Plan for Training Runs

### Test 1: Single Runner Validation
- Set up camera at finish line of a training course
- Have one runner do 5 finish line crossings at different speeds
- Validate: Does the system detect every crossing? Are timestamps consistent?
- Compare against a stopwatch

### Test 2: Small Group (3-5 runners)
- Have 3-5 runners finish together at various spacings
- Test: spread finish (5+ seconds apart), close finish (1-2 seconds), pack finish (simultaneous)
- Look for: missed detections, ID swaps, double counts

### Test 3: Form Analysis Validation
- Have a runner do 3 crossings: fresh, moderate effort, exhausted
- Check: does the trunk angle metric change? Does the system capture the difference?
- Compare the form CSV data across the three runs

### Test 4: Environmental Stress
- Test in different lighting: morning sun, overcast, late afternoon shadows
- Test with runners in different colored jerseys
- Test with spectators in the background

### Test 5: Volume Test
- Full team workout, 20-30 runners doing intervals
- Multiple crossings per runner (the system will assign new times per crossing)
- Stress test the tracking — do IDs stay consistent across a workout?

## Model Options

| Model | Speed | Accuracy | Use Case |
|-------|-------|----------|----------|
| `yolo11n-pose.pt` | Fast (~15ms) | Good | Default, works on CPU |
| `yolo11s-pose.pt` | Medium (~25ms) | Better | Recommended with GPU |
| `yolo11m-pose.pt` | Slower (~50ms) | Best | Post-processing, not real-time |
| `yolo26n-pose.pt` | Fastest (~10ms) | Good | Latest model, edge-optimized |

Switch models:
```bash
python athletos_timer.py --model yolo11s-pose.pt
```

## Known Limitations (What to Expect)

1. **No bib reading yet.** Runners are identified by track ID (a number assigned by the tracker), not by bib number. Bib OCR is Phase 2.

2. **Track IDs can swap.** If two runners overlap and separate, the tracker may swap their IDs. This is the most common failure mode. Multi-camera fusion (Phase 2) largely solves this.

3. **The finish line is position-based.** It triggers when the center of the bounding box crosses the line. Torso-based detection using pose keypoints (more accurate) is the Phase 2 upgrade.

4. **Form metrics are relative, not absolute.** Trunk angle in degrees is meaningful. But "hip height" is in pixel coordinates — it changes with camera distance and angle. Normalization against body height (from keypoints) is a Phase 2 improvement.

5. **Single camera only in this version.** Running two instances on two cameras works, but the results aren't merged. Multi-camera fusion with shared track IDs is Phase 3.

## Roadmap from Here

### Phase 1: Validate (You are here — Weeks 1-4)
- Run this prototype at 5+ training sessions
- Collect data on detection rates, failure modes
- Document what works and what breaks
- Record race footage for offline analysis

### Phase 2: Harden (Weeks 5-12)
- Add bib OCR (PaddleOCR integration)
- Torso-based finish detection using pose keypoints
- Multi-camera merging (2 cameras, shared results)
- Web-based results display (live leaderboard)
- QR code backup scanning at chute exit

### Phase 3: First Real Race (Weeks 13-20)
- Deploy at a real XC race alongside traditional timing (as backup)
- Side-by-side accuracy comparison
- Volunteer checkpoint web app prototype
- Post-race form analysis reports

### Phase 4: Product (Weeks 21-30)
- Standalone timing product for small races
- Spectator crowd-sourcing web app
- Athlete subscription with form analysis
- Integration with RunSignup for results publishing

## Legal Notes (Do Before First Public Event)

- [ ] Contact Ultralytics re: commercial licensing (AGPL-3.0 applies to this code)
- [ ] Consult privacy attorney re: video capture at events (BIPA if in Illinois)
- [ ] Get timing company liability insurance (E&O coverage)
- [ ] Draft participant consent language for race waivers
