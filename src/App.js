import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState, useRef, useCallback } from 'react';

// ─── CONFIG — Update WS_URL to your laptop's local IP ────────────
const CONFIG = {
  WS_URL: 'ws://192.168.0.79:8765',
  CAPTURE_INTERVAL_MS: 200,
  CAPTURE_QUALITY: 0.4,
};

const MODES = [
  { key: 'finish_line', label: 'FINISH\nLINE' },
  { key: 'checkpoint', label: 'CHECK\nPOINT' },
  { key: 'lap_timing', label: 'LAP\nTIME' },
  { key: 'multi_split', label: 'MULTI\nSPLIT' },
];

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [mode, setMode] = useState('finish_line');
  const [results, setResults] = useState([]);
  const [fps, setFps] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [showResults, setShowResults] = useState(false);

  const captureIntervalRef = useRef(null);
  const fpsIntervalRef = useRef(null);
  const frameCountRef = useRef(0);

  // ─── WebSocket ─────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(CONFIG.WS_URL);

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'config', mode }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'timing_result') {
            setResults(prev => {
              const r = msg.data;
              if (prev.find(x => x.bib === r.bib && x.place === r.place)) return prev;
              return [...prev, r].sort((a, b) => a.place - b.place);
            });
          }
        } catch (e) { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Auto-reconnect
        setTimeout(() => {
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            connectWebSocket();
          }
        }, 3000);
      };

      ws.onerror = () => setWsConnected(false);
      wsRef.current = ws;
    } catch (e) {
      console.error('WS connect error:', e);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      captureIntervalRef.current && clearInterval(captureIntervalRef.current);
      fpsIntervalRef.current && clearInterval(fpsIntervalRef.current);
      wsRef.current?.close();
    };
  }, []);

  // ─── Frame Capture & Send ──────────────────────────────────────
  const captureAndSend = useCallback(async () => {
    if (!cameraRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: CONFIG.CAPTURE_QUALITY,
        base64: true,
        skipProcessing: true,
      });

      if (!photo?.base64) return;

      wsRef.current.send(JSON.stringify({
        type: 'frame',
        timestamp: Date.now(),
        image: photo.base64,
        mode,
      }));

      frameCountRef.current += 1;
    } catch (e) {
      // Camera busy — skip frame
    }
  }, [mode]);

  const startCapture = useCallback(() => {
    if (!wsConnected) {
      Alert.alert('Not Connected', 'Connect to the timing server first.');
      return;
    }

    setIsCapturing(true);
    setResults([]);
    frameCountRef.current = 0;
    setTotalFrames(0);

    wsRef.current?.send(JSON.stringify({
      type: 'command',
      action: 'start_timing',
      mode,
      timestamp: Date.now(),
    }));

    captureIntervalRef.current = setInterval(captureAndSend, CONFIG.CAPTURE_INTERVAL_MS);

    fpsIntervalRef.current = setInterval(() => {
      setFps(frameCountRef.current);
      setTotalFrames(prev => prev + frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
  }, [wsConnected, mode, captureAndSend]);

  const stopCapture = useCallback(() => {
    setIsCapturing(false);
    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);

    wsRef.current?.send(JSON.stringify({
      type: 'command',
      action: 'stop_timing',
      timestamp: Date.now(),
    }));
  }, []);

  // ─── Permission guard ──────────────────────────────────────────
  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <View style={s.container}>
        <Text style={s.msgText}>Camera permission required</Text>
        <TouchableOpacity style={s.btnPrimary} onPress={requestPermission}>
          <Text style={s.btnPrimaryText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />

      {/* Finish line overlay */}
      {mode === 'finish_line' && (
        <View style={s.finishLineWrap} pointerEvents="none">
          <View style={s.finishLine} />
          <View style={s.finishLabel}>
            <Text style={s.finishLabelText}>FINISH</Text>
          </View>
        </View>
      )}

      {/* Recording indicator */}
      {isCapturing && (
        <View style={s.recBadge}>
          <View style={s.recDot} />
          <Text style={s.recText}>TIMING</Text>
          <Text style={s.fpsText}>{fps} FPS</Text>
        </View>
      )}

      {/* Top bar */}
      <View style={s.topBar}>
        <Text style={s.title}>AthletOS Timer</Text>
        <View style={s.statusRow}>
          <View style={[s.dot, { backgroundColor: wsConnected ? '#00ff88' : '#ff4444' }]} />
          <Text style={s.statusText}>{wsConnected ? 'Connected' : 'Disconnected'}</Text>
        </View>
      </View>

      {/* Bottom panel */}
      <View style={s.bottomPanel}>
        {/* Mode selector */}
        <View style={s.modeRow}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[s.modeBtn, mode === m.key && s.modeBtnActive]}
              onPress={() => !isCapturing && setMode(m.key)}
              disabled={isCapturing}
            >
              <Text style={[s.modeBtnText, mode === m.key && s.modeBtnTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Controls */}
        <View style={s.controlRow}>
          {!wsConnected ? (
            <TouchableOpacity style={s.connectBtn} onPress={connectWebSocket}>
              <Text style={s.connectBtnText}>Connect to Server</Text>
            </TouchableOpacity>
          ) : !isCapturing ? (
            <TouchableOpacity style={s.startBtn} onPress={startCapture}>
              <Text style={s.startBtnText}>START TIMING</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.stopBtn} onPress={stopCapture}>
              <Text style={s.stopBtnText}>STOP</Text>
            </TouchableOpacity>
          )}

          {results.length > 0 && (
            <TouchableOpacity style={s.resultsToggle} onPress={() => setShowResults(!showResults)}>
              <Text style={s.resultsToggleText}>{results.length}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        {showResults && results.length > 0 && (
          <View style={s.resultsPanel}>
            <Text style={s.resultsTitle}>Results ({results.length})</Text>
            <ScrollView style={s.resultsList} nestedScrollEnabled>
              {results.map((r) => (
                <View key={`${r.bib}-${r.place}`} style={s.resultRow}>
                  <Text style={s.resultPlace}>{r.place}</Text>
                  <Text style={s.resultBib}>#{r.bib}</Text>
                  <Text style={s.resultTime}>{r.time}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  msgText: { color: '#fff', fontSize: 18, textAlign: 'center', marginTop: 100 },
  btnPrimary: { backgroundColor: '#00ff88', marginTop: 20, paddingHorizontal: 30, paddingVertical: 14, borderRadius: 10, alignSelf: 'center' },
  btnPrimaryText: { color: '#000', fontSize: 16, fontWeight: '700' },

  topBar: { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 10 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { color: '#aaa', fontSize: 12 },

  finishLineWrap: { position: 'absolute', top: 0, bottom: 0, left: '50%', zIndex: 5, alignItems: 'center' },
  finishLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(255,0,0,0.6)' },
  finishLabel: { position: 'absolute', top: 120, backgroundColor: 'rgba(255,0,0,0.8)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  finishLabelText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  recBadge: { position: 'absolute', top: 60, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, zIndex: 10 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff0000', marginRight: 6 },
  recText: { color: '#ff0000', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginRight: 8 },
  fpsText: { color: '#00ff88', fontSize: 11, fontWeight: '600' },

  bottomPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingHorizontal: 12, zIndex: 10 },

  modeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modeBtnActive: { backgroundColor: 'rgba(0,255,136,0.15)', borderColor: '#00ff88' },
  modeBtnText: { color: '#666', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  modeBtnTextActive: { color: '#00ff88' },

  controlRow: { flexDirection: 'row', gap: 10 },
  connectBtn: { flex: 1, backgroundColor: '#2a2aff', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  connectBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  startBtn: { flex: 1, backgroundColor: '#00ff88', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  startBtnText: { color: '#000', fontSize: 18, fontWeight: '800' },
  stopBtn: { flex: 1, backgroundColor: '#ff4444', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  stopBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  resultsToggle: { width: 56, height: 56, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#00ff88' },
  resultsToggleText: { color: '#00ff88', fontSize: 20, fontWeight: '800' },

  resultsPanel: { marginTop: 10, backgroundColor: 'rgba(10,10,20,0.95)', borderRadius: 12, padding: 12, maxHeight: 200 },
  resultsTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  resultsList: { flex: 1 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  resultPlace: { color: '#00ff88', fontSize: 18, fontWeight: '800', width: 36, fontFamily: 'monospace' },
  resultBib: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  resultTime: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
});
