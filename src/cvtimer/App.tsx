import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';

// ─── Configuration ───────────────────────────────────────────────
const CONFIG = {
  // WebSocket server running your YOLO inference backend
  WS_URL: 'ws://YOUR_SERVER_IP:8765',
  
  // Frame capture settings
  CAPTURE_INTERVAL_MS: 100,    // 10 FPS — good balance of accuracy vs bandwidth
  CAPTURE_QUALITY: 0.6,        // JPEG quality (0-1)
  CAPTURE_WIDTH: 640,          // Resize before sending (YOLO input is typically 640x640)
  
  // Timing modes
  MODES: {
    FINISH_LINE: 'finish_line',
    CHECKPOINT: 'checkpoint',
    LAP_TIMING: 'lap_timing',
    MULTI_SPLIT: 'multi_split',
  },
};

// ─── Types ───────────────────────────────────────────────────────
interface Detection {
  bib: string;
  confidence: number;
  bbox: [number, number, number, number];
  timestamp: number;
  trackId: number;
}

interface TimingResult {
  bib: string;
  name?: string;
  team?: string;
  time: string;
  place: number;
  splits?: string[];
}

interface ServerMessage {
  type: 'detection' | 'timing_result' | 'status' | 'error';
  data: Detection[] | TimingResult | string;
}

// ─── Main App ────────────────────────────────────────────────────
export default function App() {
  // Camera
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const cameraRef = useRef<CameraView>(null);

  // Connection
  const [wsConnected, setWsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState(CONFIG.WS_URL);
  const wsRef = useRef<WebSocket | null>(null);

  // Timing state
  const [isCapturing, setIsCapturing] = useState(false);
  const [mode, setMode] = useState(CONFIG.MODES.FINISH_LINE);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [results, setResults] = useState<TimingResult[]>([]);
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);

  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);

  // ─── WebSocket Connection ────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      setWsConnected(true);
      // Send configuration to server
      ws.send(JSON.stringify({
        type: 'config',
        mode: mode,
        captureWidth: CONFIG.CAPTURE_WIDTH,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'detection':
            setDetections(msg.data as Detection[]);
            break;
          case 'timing_result':
            setResults(prev => {
              const result = msg.data as TimingResult;
              // Avoid duplicates
              if (prev.find(r => r.bib === result.bib && r.place === result.place)) return prev;
              return [...prev, result].sort((a, b) => a.place - b.place);
            });
            break;
          case 'error':
            console.warn('Server error:', msg.data);
            break;
        }
      } catch (e) {
        console.error('Failed to parse server message:', e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      // Auto-reconnect after 3s
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    wsRef.current = ws;
  }, [serverUrl, mode]);

  const disconnectWebSocket = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setWsConnected(false);
  }, []);

  // ─── Frame Capture & Streaming ───────────────────────────────
  const captureAndSendFrame = useCallback(async () => {
    if (!cameraRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      // Capture frame from camera
      const photo = await cameraRef.current.takePictureAsync({
        quality: CONFIG.CAPTURE_QUALITY,
        base64: true,
        skipProcessing: true, // Faster — skip auto-rotation etc.
      });

      if (!photo?.base64) return;

      // Resize for efficient transfer (YOLO expects 640x640 anyway)
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: CONFIG.CAPTURE_WIDTH } }],
        { compress: CONFIG.CAPTURE_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      // Send frame + metadata to server
      wsRef.current.send(JSON.stringify({
        type: 'frame',
        timestamp: Date.now(),
        image: resized.base64,
        mode: mode,
      }));

      frameCountRef.current += 1;
    } catch (error) {
      // Camera might be busy — skip this frame
      console.debug('Frame capture skipped:', error);
    }
  }, [mode]);

  const startCapture = useCallback(() => {
    if (!wsConnected) {
      Alert.alert('Not Connected', 'Connect to the timing server first.');
      return;
    }

    setIsCapturing(true);
    setResults([]); // Clear previous results
    frameCountRef.current = 0;

    // Send start signal
    wsRef.current?.send(JSON.stringify({
      type: 'command',
      action: 'start_timing',
      mode: mode,
      timestamp: Date.now(),
    }));

    // Start capturing frames
    captureIntervalRef.current = setInterval(captureAndSendFrame, CONFIG.CAPTURE_INTERVAL_MS);

    // FPS counter
    fpsIntervalRef.current = setInterval(() => {
      setFps(frameCountRef.current);
      setFrameCount(prev => prev + frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
  }, [wsConnected, mode, captureAndSendFrame]);

  const stopCapture = useCallback(() => {
    setIsCapturing(false);

    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);

    // Send stop signal
    wsRef.current?.send(JSON.stringify({
      type: 'command',
      action: 'stop_timing',
      timestamp: Date.now(),
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture();
      disconnectWebSocket();
    };
  }, []);

  // ─── Permission Handling ─────────────────────────────────────
  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            AthletOS needs camera access to detect and time athletes.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AthletOS Timer</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: wsConnected ? '#00ff88' : '#ff4444' }]} />
          <Text style={styles.statusText}>
            {wsConnected ? 'Connected' : 'Disconnected'}
          </Text>
          {isCapturing && (
            <Text style={styles.fpsText}>{fps} FPS | {frameCount} frames</Text>
          )}
        </View>
      </View>

      {/* Mode Selector */}
      <View style={styles.modeRow}>
        {Object.entries(CONFIG.MODES).map(([key, value]) => (
          <TouchableOpacity
            key={key}
            style={[styles.modeButton, mode === value && styles.modeButtonActive]}
            onPress={() => !isCapturing && setMode(value)}
          >
            <Text style={[styles.modeButtonText, mode === value && styles.modeButtonTextActive]}>
              {key.replace('_', '\n')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
        >
          {/* Finish line overlay */}
          {mode === CONFIG.MODES.FINISH_LINE && (
            <View style={styles.finishLineOverlay}>
              <View style={styles.finishLine} />
              <Text style={styles.finishLineLabel}>FINISH LINE</Text>
            </View>
          )}

          {/* Detection boxes overlay */}
          {detections.map((det, i) => (
            <View
              key={`${det.trackId}-${i}`}
              style={[
                styles.detectionBox,
                {
                  left: `${det.bbox[0]}%`,
                  top: `${det.bbox[1]}%`,
                  width: `${det.bbox[2] - det.bbox[0]}%`,
                  height: `${det.bbox[3] - det.bbox[1]}%`,
                },
              ]}
            >
              <Text style={styles.detectionLabel}>
                #{det.bib} ({(det.confidence * 100).toFixed(0)}%)
              </Text>
            </View>
          ))}

          {/* Recording indicator */}
          {isCapturing && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>TIMING</Text>
            </View>
          )}
        </CameraView>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!wsConnected ? (
          <TouchableOpacity style={styles.connectButton} onPress={connectWebSocket}>
            <Text style={styles.connectButtonText}>Connect to Server</Text>
          </TouchableOpacity>
        ) : !isCapturing ? (
          <TouchableOpacity style={styles.startButton} onPress={startCapture}>
            <Text style={styles.startButtonText}>▶ START TIMING</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopButton} onPress={stopCapture}>
            <Text style={styles.stopButtonText}>■ STOP</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.flipButton}
          onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
        >
          <Text style={styles.flipButtonText}>⟳</Text>
        </TouchableOpacity>
      </View>

      {/* Live Results */}
      {results.length > 0 && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>
            Results ({results.length} finishers)
          </Text>
          <ScrollView style={styles.resultsList} nestedScrollEnabled>
            {results.map((r, i) => (
              <View key={`${r.bib}-${r.place}`} style={styles.resultRow}>
                <Text style={styles.resultPlace}>{r.place}</Text>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultBib}>#{r.bib}</Text>
                  {r.name && <Text style={styles.resultName}>{r.name}</Text>}
                </View>
                <Text style={styles.resultTime}>{r.time}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  // Permission
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  permissionText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#888',
    fontSize: 12,
  },
  fpsText: {
    color: '#00ff88',
    fontSize: 12,
    marginLeft: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // Mode selector
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#00ff8820',
    borderColor: '#00ff88',
  },
  modeButtonText: {
    color: '#666',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  modeButtonTextActive: {
    color: '#00ff88',
  },
  // Camera
  cameraContainer: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  camera: {
    flex: 1,
  },
  // Overlays
  finishLineOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    alignItems: 'center',
  },
  finishLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#ff000088',
  },
  finishLineLabel: {
    position: 'absolute',
    top: 16,
    backgroundColor: '#ff0000cc',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  detectionBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 4,
  },
  detectionLabel: {
    position: 'absolute',
    top: -20,
    left: 0,
    backgroundColor: '#00ff88',
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  recordingIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000aa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff0000',
    marginRight: 6,
  },
  recordingText: {
    color: '#ff0000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  // Controls
  controls: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  connectButton: {
    flex: 1,
    backgroundColor: '#2a2aff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  startButton: {
    flex: 1,
    backgroundColor: '#00ff88',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '800',
  },
  stopButton: {
    flex: 1,
    backgroundColor: '#ff4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  flipButton: {
    width: 56,
    height: 56,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  // Results
  resultsContainer: {
    maxHeight: 200,
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#111122',
    borderRadius: 12,
    padding: 12,
  },
  resultsTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  resultsList: {
    flex: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  resultPlace: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: '800',
    width: 36,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resultInfo: {
    flex: 1,
  },
  resultBib: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultName: {
    color: '#888',
    fontSize: 12,
  },
  resultTime: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
