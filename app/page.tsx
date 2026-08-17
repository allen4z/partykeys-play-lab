"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { disableNativeSampler, initPopuDisplay, isPopuWebview } from "./popu";

type MidiEvent = {
  type: "on" | "off" | "pedal";
  note?: number;
  velocity?: number;
  value?: number;
  on?: boolean;
  channel: number;
  time: number;
  portId: string;
};

type DeviceProfile = "partykeys36" | "popupiano29" | null;
type LightMode = "palette71" | "rgb15";
type KeyMode = "poly" | "mono" | "chord";
type PanelMode = "keys" | "loop" | "fx" | "step" | null;
type LoopStatus = "idle" | "recording" | "playing";
type Locale = "zh" | "en";
type LoopEvent = { type: "on" | "off"; note: number; velocity: number; at: number };
type Mood = { name: string; english: string; description: string; colors: readonly (readonly [number, number, number])[] };
type ScalePreset = { name: string; short: string; intervals: readonly number[]; colors: readonly (readonly [number, number, number])[] };
type MidiBrowserWindow = Window & {
  webkit?: { messageHandlers?: { midiBridge?: unknown } };
  __webMIDIBridge?: unknown;
};

const NOTES = Array.from({ length: 36 }, (_, index) => 48 + index);
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const WHITE_NOTES = NOTES.filter((note) => ![1, 3, 6, 8, 10].includes(note % 12));
const BLACK_NOTES = NOTES.filter((note) => [1, 3, 6, 8, 10].includes(note % 12));
const SAMPLE_PITCHES = [48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84];
const SAMPLE_LAYERS = [
  { suffix: 4, maxVelocity: 45 },
  { suffix: 8, maxVelocity: 78 },
  { suffix: 12, maxVelocity: 106 },
  { suffix: 16, maxVelocity: 127 },
];
const PK_HEADER = [0xf0, 0x05, 0x30, 0x7f, 0x7f, 0x20, 0x00];
const MOODS: readonly Mood[] = [
  { name: "温暖", english: "WARM", description: "琥珀 · 珊瑚 · 烛光", colors: [[130, 62, 42], [206, 100, 62], [246, 176, 82], [255, 220, 156]] },
  { name: "复古", english: "AGED", description: "橄榄 · 黄铜 · 胶片", colors: [[62, 68, 43], [112, 112, 68], [174, 139, 72], [218, 188, 124]] },
  { name: "热烈", english: "BLAZE", description: "猩红 · 橙焰 · 洋红", colors: [[144, 18, 48], [232, 48, 58], [255, 116, 42], [255, 72, 137]] },
  { name: "宽容", english: "OPEN", description: "青蓝 · 天空 · 淡紫", colors: [[36, 106, 146], [72, 169, 196], [103, 139, 255], [188, 164, 255]] },
] as const;

const CHORD_INTERVALS: Record<number, readonly [number, number]> = {
  0: [4, 7], 2: [3, 7], 4: [3, 7], 5: [4, 7], 7: [4, 7], 9: [3, 7], 11: [3, 6],
};

const SCALE_PRESETS: readonly ScalePreset[] = [
  { name: "蓝调", short: "BLUES", intervals: [0, 3, 5, 6, 7, 10], colors: [[26, 80, 156], [34, 142, 210], [80, 210, 232], [116, 98, 220], [44, 174, 200], [120, 210, 255]] },
  { name: "中国风", short: "CHINA", intervals: [0, 2, 4, 7, 9], colors: [[196, 36, 48], [224, 132, 38], [246, 202, 92], [44, 144, 108], [84, 186, 146]] },
  { name: "弗拉明戈", short: "FLAMENCO", intervals: [0, 1, 4, 5, 7, 8, 10], colors: [[150, 10, 26], [232, 42, 28], [255, 104, 24], [255, 184, 52], [190, 26, 48], [242, 78, 42], [255, 214, 100]] },
  { name: "爵士", short: "JAZZ", intervals: [0, 2, 4, 5, 7, 9, 10], colors: [[76, 50, 172], [118, 74, 220], [66, 180, 212], [50, 210, 170], [170, 98, 230], [94, 204, 238], [206, 152, 255]] },
  { name: "多利亚", short: "DORIAN", intervals: [0, 2, 3, 5, 7, 9, 10], colors: [[24, 104, 112], [35, 156, 154], [56, 202, 172], [72, 134, 164], [44, 190, 154], [112, 222, 184], [70, 158, 190]] },
  { name: "阿拉伯", short: "ARABIC", intervals: [0, 1, 4, 5, 7, 8, 11], colors: [[78, 32, 126], [132, 56, 150], [218, 132, 36], [250, 190, 58], [104, 46, 144], [232, 158, 48], [255, 220, 112]] },
  { name: "和风", short: "JAPAN", intervals: [0, 1, 5, 7, 8], colors: [[178, 54, 104], [238, 112, 152], [255, 190, 202], [232, 232, 246], [174, 124, 212]] },
  { name: "大调", short: "MAJOR", intervals: [0, 2, 4, 5, 7, 9, 11], colors: [[38, 124, 210], [62, 166, 228], [82, 204, 220], [72, 188, 158], [100, 176, 242], [130, 214, 220], [164, 224, 250]] },
  { name: "小调", short: "MINOR", intervals: [0, 2, 3, 5, 7, 8, 10], colors: [[82, 42, 142], [114, 60, 180], [152, 76, 190], [92, 106, 202], [132, 82, 206], [186, 98, 190], [124, 118, 224]] },
] as const;

const MOOD_EN = [
  { name: "Warm", description: "Amber · coral · candlelight" },
  { name: "Vintage", description: "Olive · brass · film" },
  { name: "Blaze", description: "Crimson · flame · magenta" },
  { name: "Open", description: "Cyan · sky · lavender" },
] as const;

const SCALE_EN = ["Blues", "Chinese", "Flamenco", "Jazz", "Dorian", "Arabic", "Japanese", "Major", "Minor"] as const;

function noteLabel(note: number) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

function isNativeMidiBrowser() {
  if (typeof window === "undefined") return false;
  const midiWindow = window as MidiBrowserWindow;
  if (midiWindow.webkit?.messageHandlers?.midiBridge && midiWindow.__webMIDIBridge) return true;
  return isPopuWebview();
}

function sampleName(note: number) {
  const names = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

function normalizeMidiTimestamp(value: unknown) {
  let time = Number(value);
  const now = performance.now();
  if (!Number.isFinite(time)) return now;
  if (time > 1e11 && Number.isFinite(performance.timeOrigin)) time -= performance.timeOrigin;
  return Math.abs(time - now) > 60_000 ? now : time;
}

function encodeChannel(value: number) {
  const clean = Math.max(0, Math.min(255, Math.round(value)));
  return [Math.floor(clean / 128), clean % 128];
}

function rgbFrame(key: number, rgb: readonly number[]) {
  return [
    ...PK_HEADER,
    0x15,
    0x01,
    ...encodeChannel(rgb[0]),
    ...encodeChannel(rgb[1]),
    ...encodeChannel(rgb[2]),
    0x01,
    key,
    0xf7,
  ];
}

function rgbGroupsFrame(groups: { rgb: readonly number[]; keys: number[] }[]) {
  const body = groups.flatMap(({ rgb, keys }) => [
    ...encodeChannel(rgb[0]), ...encodeChannel(rgb[1]), ...encodeChannel(rgb[2]), keys.length, ...keys,
  ]);
  return [...PK_HEADER, 0x15, groups.length, ...body, 0xf7];
}

function partyKeysAllOff(mode: LightMode) {
  if (mode === "palette71") return [...PK_HEADER, 0x71, 0x00, 0xf7];
  return [
    ...PK_HEADER,
    0x15,
    0x01,
    0, 0, 0, 0, 0, 0,
    36,
    ...Array.from({ length: 36 }, (_, index) => index),
    0xf7,
  ];
}

class PianoEngine {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  keysBus: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  toneFilter: BiquadFilterNode | null = null;
  reverbWet: GainNode | null = null;
  delayNode: DelayNode | null = null;
  delayWet: GainNode | null = null;
  delayFeedback: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  fallbackWave: PeriodicWave | null = null;
  buffers: AudioBuffer[][] | null = null;
  loading: Promise<void> | null = null;
  ready = false;
  sustain = false;
  volume = 0.76;
  active = new Map<string, { node: AudioScheduledSourceNode; gain: GainNode; source: string }>();
  deferred = new Set<string>();

  ensureAudio() {
    if (!this.context) this.createGraph();
    void this.context?.resume();
    if (!this.loading) this.loading = this.loadSamples();
    return this.context!;
  }

  createGraph() {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AudioCtor();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.volume;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.ratio.value = 3;
    this.compressor.knee.value = 8;
    this.keysBus = context.createGain();
    this.toneFilter = context.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = 7200;
    this.toneFilter.Q.value = 0.55;
    this.keysBus.connect(this.toneFilter);
    this.toneFilter.connect(this.master);
    this.master.connect(this.compressor);
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.86;
    this.compressor.connect(this.analyser);
    this.analyser.connect(context.destination);

    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * 1.9), context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length) ** 2.6;
      }
    }
    const reverb = context.createConvolver();
    const wet = context.createGain();
    reverb.buffer = impulse;
    wet.gain.value = 0.16;
    this.reverbWet = wet;
    this.keysBus.connect(reverb);
    reverb.connect(wet);
    wet.connect(this.master);

    this.delayNode = context.createDelay(1.2);
    this.delayNode.delayTime.value = 0.24;
    this.delayWet = context.createGain();
    this.delayWet.gain.value = 0.08;
    this.delayFeedback = context.createGain();
    this.delayFeedback.gain.value = 0.28;
    this.keysBus.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.master);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);

    const harmonics = [0, 1, 0.55, 0.28, 0.14, 0.07];
    const real = new Float32Array(harmonics.length);
    const imaginary = new Float32Array(harmonics);
    this.fallbackWave = context.createPeriodicWave(real, imaginary);
  }

  async loadSamples() {
    if (!this.context) return;
    try {
      const decoded = await Promise.all(
        SAMPLE_LAYERS.flatMap((layer, layerIndex) =>
          SAMPLE_PITCHES.map(async (pitch, pitchIndex) => {
            const response = await fetch(`/samples/${sampleName(pitch)}v${layer.suffix}.mp3`);
            if (!response.ok) throw new Error("sample unavailable");
            const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
            return { layerIndex, pitchIndex, buffer };
          }),
        ),
      );
      this.buffers = SAMPLE_LAYERS.map(() => new Array<AudioBuffer>(SAMPLE_PITCHES.length));
      decoded.forEach(({ layerIndex, pitchIndex, buffer }) => {
        this.buffers![layerIndex][pitchIndex] = buffer;
      });
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  setVolume(value: number) {
    this.volume = value;
    if (this.master && this.context) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.03);
  }

  setTone(value: number) {
    if (!this.context || !this.toneFilter) return;
    const frequency = 900 * 2 ** (value / 18);
    this.toneFilter.frequency.setTargetAtTime(Math.min(15000, frequency), this.context.currentTime, 0.03);
  }

  setFx(reverb: number, delay: number, feedback: number) {
    if (!this.context) return;
    this.reverbWet?.gain.setTargetAtTime(reverb * 0.0042, this.context.currentTime, 0.03);
    this.delayWet?.gain.setTargetAtTime(delay * 0.0032, this.context.currentTime, 0.03);
    this.delayFeedback?.gain.setTargetAtTime(Math.min(0.78, feedback * 0.0078), this.context.currentTime, 0.03);
  }

  click(accent = false) {
    const context = this.ensureAudio();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(accent ? 0.12 : 0.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.055);
    oscillator.connect(gain);
    gain.connect(this.master!);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.06);
  }

  noteOn(note: number, velocity = 96, source = "screen") {
    const context = this.ensureAudio();
    const key = `${source}:${note}`;
    this.releaseVoice(key, 0.035, true);
    while (this.active.size >= 48) {
      const oldest = this.active.keys().next().value;
      if (!oldest) break;
      this.releaseVoice(oldest, 0.035, true);
    }

    const gain = context.createGain();
    let node: AudioScheduledSourceNode;
    if (this.ready && this.buffers) {
      const layerIndex = Math.max(0, SAMPLE_LAYERS.findIndex((layer) => velocity <= layer.maxVelocity));
      let pitchIndex = 0;
      SAMPLE_PITCHES.forEach((pitch, index) => {
        if (Math.abs(note - pitch) < Math.abs(note - SAMPLE_PITCHES[pitchIndex])) pitchIndex = index;
      });
      const sourceNode = context.createBufferSource();
      sourceNode.buffer = this.buffers[layerIndex][pitchIndex];
      sourceNode.playbackRate.value = 2 ** ((note - SAMPLE_PITCHES[pitchIndex]) / 12);
      gain.gain.value = 0.32 + 0.55 * (Math.max(1, velocity) / 127);
      node = sourceNode;
    } else {
      const oscillator = context.createOscillator();
      oscillator.setPeriodicWave(this.fallbackWave!);
      oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
      const level = Math.max((velocity / 127) * 0.32, 0.01);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(level, context.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(Math.max(level * 0.3, 0.001), context.currentTime + 1.4);
      node = oscillator;
    }
    node.connect(gain);
    gain.connect(this.keysBus!);
    node.start(context.currentTime);
    this.active.set(key, { node, gain, source });
  }

  noteOff(note: number, source = "screen") {
    const key = `${source}:${note}`;
    if (this.sustain && source === "midi") this.deferred.add(key);
    else this.releaseVoice(key, 0.28, true);
  }

  setPedal(on: boolean) {
    this.sustain = on;
    if (!on) {
      [...this.deferred].forEach((key) => this.releaseVoice(key, 0.34, true));
      this.deferred.clear();
    }
  }

  releaseVoice(key: string, release: number, force = false) {
    const voice = this.active.get(key);
    if (!voice || (!force && this.sustain && voice.source === "midi")) return;
    this.active.delete(key);
    this.deferred.delete(key);
    const time = this.context?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0005), time);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + release);
    try { voice.node.stop(time + release + 0.05); } catch { /* already stopped */ }
  }

  releaseAll() {
    [...this.active.keys()].forEach((key) => this.releaseVoice(key, 0.08, true));
    this.deferred.clear();
    this.sustain = false;
  }
}

function Knob({ label, value, color, onChange }: { label: string; value: number; color: string; onChange: (value: number) => void }) {
  return (
    <label className="knob-cell">
      <span className="knob" style={{ "--turn": `${-132 + value * 2.64}deg`, "--accent": color } as React.CSSProperties}>
        <span className="knob-mark" />
      </span>
      <input aria-label={label} type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="knob-label">{label}</span>
      <strong>{String(value).padStart(2, "0")}</strong>
    </label>
  );
}

function LiveWaveform({ engineRef, mood, activity }: { engineRef: React.RefObject<PianoEngine | null>; mood: Mood; activity: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    const points = 180;
    const smooth = new Float32Array(points);
    const previous = new Float32Array(points);
    const audioData = new Float32Array(2048);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const rgb = mood.colors[2];
    const rgb2 = mood.colors[3];
    const render = (stamp: number) => {
      const analyser = engineRef.current?.analyser;
      let energy = 0;
      if (analyser) {
        analyser.getFloatTimeDomainData(audioData);
        for (let index = 0; index < audioData.length; index += 16) energy += Math.abs(audioData[index]);
        energy /= audioData.length / 16;
      }
      previous.set(smooth);
      const breathing = 0.055 + Math.sin(stamp * 0.0008) * 0.012;
      for (let index = 0; index < points; index += 1) {
        const audioIndex = Math.floor((index / (points - 1)) * (audioData.length - 1));
        const live = energy > 0.002 ? audioData[audioIndex] * Math.min(1.25, 0.78 + energy * 5) : 0;
        const idle = Math.sin(index * 0.19 + stamp * 0.0032) * breathing + Math.sin(index * 0.063 - stamp * 0.0017) * breathing * 0.52;
        const target = live + idle + Math.sin(index * 0.31 + stamp * 0.004) * Math.min(0.06, activity * 0.008);
        smooth[index] += (target - smooth[index]) * (energy > 0.002 ? 0.34 : 0.075);
      }

      context.clearRect(0, 0, width, height);
      context.save();
      context.strokeStyle = "rgba(255,255,255,.055)";
      context.lineWidth = 1;
      for (let index = 1; index < 5; index += 1) {
        const y = (height / 5) * index;
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }
      for (let index = 1; index < 9; index += 1) {
        const x = (width / 9) * index;
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      context.restore();

      const drawPath = (values: Float32Array, alpha: number, lineWidth: number, offset = 0) => {
        const gradient = context.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
        gradient.addColorStop(0.52, `rgba(235,245,255,${Math.min(1, alpha + 0.16)})`);
        gradient.addColorStop(1, `rgba(${rgb2[0]},${rgb2[1]},${rgb2[2]},${alpha})`);
        context.beginPath();
        values.forEach((value, index) => {
          const x = (index / (points - 1)) * width;
          const y = height / 2 + value * height * 0.72 + offset;
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.strokeStyle = gradient;
        context.lineWidth = lineWidth;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.shadowColor = `rgb(${rgb.join(",")})`;
        context.shadowBlur = lineWidth > 2 ? 14 : 7;
        context.stroke();
        context.shadowBlur = 0;
      };
      drawPath(previous, 0.2, 1.1, 4);
      drawPath(smooth, 0.92, 2.15);
      drawPath(smooth, 0.17, 7.5);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [activity, engineRef, mood]);

  return <canvas ref={canvasRef} className="live-waveform" aria-label="实时音频波形" />;
}

function WaveDisplay({ activeNotes, bpm, mood, keyMode, panelContent, engineRef }: {
  activeNotes: Set<number>;
  bpm: number;
  mood: Mood;
  keyMode: KeyMode;
  panelContent?: React.ReactNode;
  engineRef: React.RefObject<PianoEngine | null>;
}) {
  return (
    <div className="display" aria-label="Audio monitor">
      <div className="display-head"><span><i /> PARTYKEYS LAB</span><span>{bpm} <b>●</b></span></div>
      <div className="scope">
        <div className="rings"><i /><i /><i /><span>{activeNotes.size || "~"}</span></div>
        <LiveWaveform engineRef={engineRef} mood={mood} activity={activeNotes.size} />
      </div>
      <div className="display-foot">
        <span style={{ color: `rgb(${mood.colors[2].join(",")})` }}>MOOD<br /><b>{mood.english}</b></span>
        <span style={{ color: "#61d99f" }}>ENGINE<br /><b>4 LAYER</b></span>
        <span>KEY MODE<br /><b>{keyMode === "poly" ? "ROOT" : keyMode === "mono" ? "MONO" : "TRIAD"}</b></span>
        <span style={{ color: "#e99b72" }}>LEVEL<br /><b>{activeNotes.size ? "LIVE" : "IDLE"}</b></span>
      </div>
      {panelContent}
    </div>
  );
}

export default function Home() {
  const engineRef = useRef<PianoEngine | null>(null);
  const midiRef = useRef<any>(null);
  const outputRef = useRef<any>(null);
  const profileRef = useRef<DeviceProfile>(null);
  const lightModeRef = useRef<LightMode>("rgb15");
  const moodRef = useRef(0);
  const guideColorsRef = useRef(new Map<number, readonly number[]>());
  const guideSlotsRef = useRef(new Map<number, number>());
  const selectedScaleRef = useRef<number | null>(null);
  const heldRef = useRef(new Set<number>());
  const heldCountsRef = useRef(new Map<number, number>());
  const generatedNotesRef = useRef(new Map<string, number[]>());
  const monoRef = useRef<{ note: number; source: string } | null>(null);
  const loopEventsRef = useRef<LoopEvent[]>([]);
  const loopStartRef = useRef(0);
  const runningStatusRef = useRef(new Map<string, number>());
  const [activeNotes, setActiveNotes] = useState(new Set<number>());
  const [locale, setLocale] = useState<Locale>("zh");
  const [connection, setConnection] = useState<"idle" | "waiting" | "connected" | "unsupported" | "error">("idle");
  const [deviceName, setDeviceName] = useState("未连接");
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>(null);
  const [lightMode] = useState<LightMode>("rgb15");
  const [statusText, setStatusText] = useState("点击任意琴键开始");
  const [appBluetooth, setAppBluetooth] = useState(false);
  const [volume, setVolume] = useState(76);
  const [tone, setTone] = useState(54);
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [moodIndex, setMoodIndex] = useState(0);
  const [keyMode, setKeyMode] = useState<KeyMode>("poly");
  const [panel, setPanel] = useState<PanelMode>(null);
  const [loopStatus, setLoopStatus] = useState<LoopStatus>("idle");
  const [loopProgress, setLoopProgress] = useState(0);
  const [loopEvents, setLoopEvents] = useState<LoopEvent[]>([]);
  const [reverb, setReverb] = useState(37);
  const [delay, setDelay] = useState(18);
  const [feedback, setFeedback] = useState(28);
  const [stepMode, setStepMode] = useState<"metronome" | "sequencer">("metronome");
  const [stepPattern, setStepPattern] = useState([true, false, false, false, true, false, false, false]);
  const [activeStep, setActiveStep] = useState(-1);
  const [selectedScale, setSelectedScale] = useState<number | null>(null);

  const text = useCallback((zh: string, en: string) => locale === "zh" ? zh : en, [locale]);

  const changeLocale = useCallback((next: Locale) => {
    setLocale(next);
    localStorage.setItem("partykeys-locale", next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    setStatusText(next === "zh" ? "语言已切换为中文" : "Language switched to English");
  }, []);

  const send = useCallback((frame: number[]) => {
    if (!outputRef.current || frame.length > 256) return;
    try { outputRef.current.send(frame); } catch { /* disconnected */ }
  }, []);

  const allLightsOff = useCallback(() => {
    if (profileRef.current === "partykeys36") send(partyKeysAllOff(lightModeRef.current));
    if (profileRef.current === "popupiano29") {
      const pairs = Array.from({ length: 29 }, (_, index) => [index, 0]).flat();
      send([0xf0, 0x03, 0x20, 29, ...pairs, 0xf7]);
    }
  }, [send]);

  const initLights = useCallback((profile: DeviceProfile, mode: LightMode) => {
    if (profile === "partykeys36") {
      send([...PK_HEADER, 0x0f, mode === "rgb15" ? 0x01 : 0x05, 0xf7]);
      send(partyKeysAllOff(mode));
    }
    if (profile === "popupiano29") {
      const palette = MOODS[moodRef.current].colors.flatMap(([r, g, b]) => [Math.min(127, Math.round(r / 2)), Math.min(127, Math.round(g / 2)), Math.min(127, Math.round(b / 2))]);
      send([0xf0, 0x03, 0x1e, 4, 1, ...palette, 0xf7]);
      const pairs = Array.from({ length: 29 }, (_, index) => [index, 0]).flat();
      send([0xf0, 0x03, 0x20, 29, ...pairs, 0xf7]);
    }
  }, [send]);

  const lightNote = useCallback((note: number, on: boolean, velocity = 96) => {
    const profile = profileRef.current;
    if (!profile || !outputRef.current) return;
    if (profile === "partykeys36" && note >= 48 && note <= 83) {
      if (lightModeRef.current === "rgb15") {
        const color = on ? MOODS[moodRef.current].colors[Math.min(3, Math.floor(Math.max(1, velocity) / 32))] : guideColorsRef.current.get(note) || [0, 0, 0];
        send(rgbFrame(note - 48, color));
      } else {
        const moodPalettes = [[3, 4, 5, 6], [7, 6, 5, 4], [1, 2, 3, 12], [8, 9, 10, 12]];
        const colorId = moodPalettes[moodRef.current][Math.min(3, Math.floor(Math.max(1, velocity) / 32))];
        send([...PK_HEADER, 0x71, 0x01, note, on ? colorId : guideSlotsRef.current.get(note) || 0x00, 0xf7]);
      }
    }
    if (profile === "popupiano29" && note >= 48 && note <= 76) {
      send([0xf0, 0x03, 0x20, 0x01, note - 48, on ? 0x01 : guideSlotsRef.current.get(note) || 0x00, 0xf7]);
    }
  }, [send]);

  const applyScaleGuide = useCallback((index: number) => {
    const preset = SCALE_PRESETS[index];
    const colors = new Map<number, readonly number[]>();
    const slots = new Map<number, number>();
    NOTES.forEach((note) => {
      const degree = preset.intervals.indexOf(note % 12);
      if (degree < 0) return;
      colors.set(note, preset.colors[degree % preset.colors.length]);
      slots.set(note, 1 + degree);
    });
    guideColorsRef.current = colors;
    guideSlotsRef.current = slots;
    selectedScaleRef.current = index;
    setSelectedScale(index);

    if (!profileRef.current || !outputRef.current) {
      setStatusText(isNativeMidiBrowser()
        ? `${preset.name}音阶已选择 · 请点右下角“连接 MIDI 设备”，连接后灯光会自动同步`
        : `${preset.name}音阶已选择 · 连接 PartyKeys 后灯光会自动同步`);
      return;
    }
    allLightsOff();

    if (profileRef.current === "partykeys36") {
      if (lightModeRef.current === "rgb15") {
        const groups = preset.colors.map((rgb) => ({
          rgb,
          keys: [...colors.entries()].filter(([, value]) => value === rgb).map(([note]) => note - 48),
        })).filter((group) => group.keys.length);
        const frame = rgbGroupsFrame(groups);
        if (frame.length <= 256) send(frame);
      } else {
        const pairs = [...slots.entries()].flatMap(([note, slot]) => [note, Math.min(12, 1 + Math.round(((slot - 1) / Math.max(1, preset.intervals.length - 1)) * 11))]);
        send([...PK_HEADER, 0x71, pairs.length / 2, ...pairs, 0xf7]);
      }
    }
    if (profileRef.current === "popupiano29") {
      const palette = preset.colors.flatMap(([r, g, b]) => [Math.min(127, Math.round(r / 2)), Math.min(127, Math.round(g / 2)), Math.min(127, Math.round(b / 2))]);
      send([0xf0, 0x03, 0x1e, preset.colors.length, 1, ...palette, 0xf7]);
      const pairs = Array.from({ length: 29 }, (_, lamp) => [lamp, slots.get(lamp + 48) || 0]).flat();
      send([0xf0, 0x03, 0x20, 29, ...pairs, 0xf7]);
    }
    setStatusText(`${preset.name}音阶 · 对应键位与风格灯光已点亮`);
  }, [allLightsOff, send]);

  const setNoteState = useCallback((note: number, on: boolean) => {
    const count = heldCountsRef.current.get(note) || 0;
    if (on) {
      heldCountsRef.current.set(note, count + 1);
      heldRef.current.add(note);
    } else if (count <= 1) {
      heldCountsRef.current.delete(note);
      heldRef.current.delete(note);
    } else heldCountsRef.current.set(note, count - 1);
    setActiveNotes(new Set(heldRef.current));
  }, []);

  const recordLoopEvent = useCallback((type: "on" | "off", note: number, velocity: number, source: string) => {
    if (loopStatus !== "recording" || source.startsWith("loop") || source.startsWith("step")) return;
    const at = Math.max(0, performance.now() - loopStartRef.current);
    loopEventsRef.current.push({ type, note, velocity, at });
  }, [loopStatus]);

  const soundNoteOn = useCallback((note: number, velocity = 100, source = "screen") => {
    engineRef.current?.noteOn(note, velocity, source);
    setNoteState(note, true);
    lightNote(note, true, velocity);
    recordLoopEvent("on", note, velocity, source);
    setStatusText(`${noteLabel(note)} · 力度 ${velocity}`);
  }, [lightNote, recordLoopEvent, setNoteState]);

  const soundNoteOff = useCallback((note: number, source = "screen") => {
    engineRef.current?.noteOff(note, source);
    setNoteState(note, false);
    lightNote(note, false);
    recordLoopEvent("off", note, 0, source);
  }, [lightNote, recordLoopEvent, setNoteState]);

  const noteOn = useCallback((note: number, velocity = 100, source = "screen") => {
    const sourceKey = `${source}:${note}`;
    if (generatedNotesRef.current.has(sourceKey)) return;
    if (keyMode === "mono" && monoRef.current) {
      const previous = monoRef.current;
      const previousKey = `${previous.source}:${previous.note}`;
      const previousNotes = generatedNotesRef.current.get(previousKey) || [previous.note];
      previousNotes.forEach((generated) => soundNoteOff(generated, `${previous.source}-${previous.note}`));
      generatedNotesRef.current.delete(previousKey);
    }
    const intervals = CHORD_INTERVALS[note % 12] || [4, 7];
    const generated = keyMode === "chord" ? [note, note + intervals[0], note + intervals[1]] : [note];
    const playable = generated.filter((value) => value >= 21 && value <= 108);
    generatedNotesRef.current.set(sourceKey, playable);
    if (keyMode === "mono") monoRef.current = { note, source };
    playable.forEach((generatedNote) => soundNoteOn(generatedNote, velocity, `${source}-${note}`));
    if (keyMode === "chord") setStatusText(`${noteLabel(note)} · ${intervals[1] === 6 ? "减三和弦" : intervals[0] === 3 ? "小三和弦" : "大三和弦"}`);
  }, [keyMode, soundNoteOff, soundNoteOn]);

  const noteOff = useCallback((note: number, source = "screen") => {
    const sourceKey = `${source}:${note}`;
    const generated = generatedNotesRef.current.get(sourceKey) || [note];
    generated.forEach((generatedNote) => soundNoteOff(generatedNote, `${source}-${note}`));
    generatedNotesRef.current.delete(sourceKey);
    if (monoRef.current?.note === note && monoRef.current.source === source) monoRef.current = null;
  }, [soundNoteOff]);

  const parseMidiPacket = useCallback((data: unknown, rawTime: unknown, portId: string) => {
    const bytes = Array.from(data as ArrayLike<number> || [], (value) => Number(value) & 0xff).filter((value) => value < 0xf8);
    let index = 0;
    let runningStatus = runningStatusRef.current.get(portId) || 0;
    const emit = (event: MidiEvent) => {
      if (event.type === "on") noteOn(event.note!, event.velocity!, "midi");
      if (event.type === "off") noteOff(event.note!, "midi");
      if (event.type === "pedal") engineRef.current?.setPedal(Boolean(event.on));
    };
    while (index < bytes.length) {
      let status = bytes[index];
      if (status & 0x80) {
        index += 1;
        if (status >= 0xf0) {
          runningStatus = 0;
          if (status === 0xf0) {
            while (index < bytes.length && bytes[index] !== 0xf7) index += 1;
            if (index < bytes.length) index += 1;
          } else index += status === 0xf2 ? 2 : status === 0xf1 || status === 0xf3 ? 1 : 0;
          continue;
        }
        runningStatus = status;
      } else if (!runningStatus) {
        index += 1;
        continue;
      } else status = runningStatus;
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const length = command === 0xc0 || command === 0xd0 ? 1 : 2;
      if (index + length > bytes.length) break;
      const data1 = bytes[index++];
      const data2 = length === 2 ? bytes[index++] : 0;
      const base = { channel, time: normalizeMidiTimestamp(rawTime), portId };
      if (command === 0x90 && data2 > 0) emit({ ...base, type: "on", note: data1, velocity: data2 });
      else if (command === 0x80 || (command === 0x90 && data2 === 0)) emit({ ...base, type: "off", note: data1, velocity: 0 });
      else if (command === 0xb0 && data1 === 64) emit({ ...base, type: "pedal", value: data2, on: data2 >= 64 });
    }
    runningStatusRef.current.set(portId, runningStatus);
  }, [noteOff, noteOn]);

  const bindPorts = useCallback((access: any) => {
    const inputs = [...(access?.inputs?.values?.() || [])].filter((port: any) => port.state !== "disconnected");
    const outputs = [...(access?.outputs?.values?.() || [])].filter((port: any) => port.state !== "disconnected");
    inputs.forEach((input: any) => {
      input.onmidimessage = (event: any) => parseMidiPacket(event.data, event.timeStamp ?? event.receivedTime, input.id || "midi");
    });
    const partyOutput = outputs.find((port: any) => /partykey/i.test(`${port.name} ${port.manufacturer}`));
    const popuOutput = outputs.find((port: any) => /popupiano/i.test(`${port.name} ${port.manufacturer}`));
    // Apple's BLE-MIDI panel exposes some PartyKeys firmware simply as
    // "Bluetooth". In this branded native shell, one matching BLE input/output
    // pair is the designated hardware the user explicitly selected in that panel.
    const nativeBluetoothOutput = !partyOutput && !popuOutput && isNativeMidiBrowser()
      && inputs.length === 1 && outputs.length === 1
      && /bluetooth/i.test(`${inputs[0].name} ${outputs[0].name}`)
      ? outputs[0]
      : null;
    const output = partyOutput || popuOutput || nativeBluetoothOutput || null;
    outputRef.current = output;
    const profile: DeviceProfile = partyOutput || nativeBluetoothOutput ? "partykeys36" : popuOutput ? "popupiano29" : null;
    profileRef.current = profile;
    setDeviceProfile(profile);
    if (profile && output) {
      const mode = profile === "partykeys36" ? lightModeRef.current : "palette71";
      initLights(profile, mode);
      if (selectedScaleRef.current != null) window.setTimeout(() => applyScaleGuide(selectedScaleRef.current!), 0);
      setConnection("connected");
      setDeviceName(nativeBluetoothOutput ? "PartyKeys（蓝牙 MIDI）" : output.name || (profile === "partykeys36" ? "PartyKeys 36" : "PopuPiano 29"));
      setStatusText("设备已连接 · 灯光与音色就绪");
    } else if (inputs.length) {
      setConnection("connected");
      setDeviceName(inputs[0].name || "标准 MIDI 键盘");
      setStatusText("标准 MIDI 已连接 · 仅启用发声");
    } else {
      setConnection("waiting");
      setDeviceName("等待设备");
      setStatusText(isNativeMidiBrowser() ? "请在底部点“连接 MIDI 设备”完成蓝牙配对" : "请连接 USB/BLE MIDI，页面会自动发现");
    }
  }, [applyScaleGuide, initLights, parseMidiPacket]);

  const connectMidi = useCallback(async (unlockAudio = true) => {
    if (unlockAudio) engineRef.current?.ensureAudio();
    const nav = navigator as Navigator & { requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<any> };
    if (!nav.requestMIDIAccess) {
      setConnection("unsupported");
      setStatusText("此浏览器不支持 Web MIDI，请使用 Chrome / Edge 或 MidiBrowser");
      return;
    }
    setConnection("waiting");
    setStatusText("正在请求 MIDI 与 SysEx 权限…");
    try {
      let access: any;
      try { access = await nav.requestMIDIAccess({ sysex: true }); }
      catch { access = await nav.requestMIDIAccess(); }
      midiRef.current = access;
      access.onstatechange = () => bindPorts(access);
      bindPorts(access);
    } catch {
      setConnection("error");
      setStatusText("MIDI 权限未开启，可刷新后重新允许");
    }
  }, [bindPorts]);

  const startLoopRecording = useCallback(() => {
    engineRef.current?.ensureAudio();
    loopEventsRef.current = [];
    setLoopEvents([]);
    loopStartRef.current = performance.now();
    setLoopProgress(0);
    setLoopStatus("recording");
    setPanel("loop");
    setStatusText("LOOP 录制中 · 接下来 8 拍会自动循环");
  }, []);

  const stopLoop = useCallback((clear = false) => {
    setLoopStatus("idle");
    setLoopProgress(0);
    if (clear) {
      loopEventsRef.current = [];
      setLoopEvents([]);
      setStatusText("LOOP 已清空");
    } else setStatusText("LOOP 已停止");
  }, []);

  useEffect(() => {
    if (!engineRef.current) engineRef.current = new PianoEngine();
    const savedLocale = localStorage.getItem("partykeys-locale");
    const initialLocale: Locale = savedLocale === "en" ? "en" : "zh";
    setLocale(initialLocale);
    document.documentElement.lang = initialLocale === "zh" ? "zh-CN" : "en";
    if (initialLocale === "en") {
      setDeviceName("Not connected");
      setStatusText("Play any key to begin");
    }
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    initPopuDisplay();
    void disableNativeSampler();
    setAppBluetooth(isNativeMidiBrowser());
    const pageHide = () => { allLightsOff(); engineRef.current?.releaseAll(); };
    window.addEventListener("pagehide", pageHide);
    if (isNativeMidiBrowser()) window.setTimeout(() => void connectMidi(false), 0);
    return () => window.removeEventListener("pagehide", pageHide);
  }, [allLightsOff, connectMidi]);

  useEffect(() => {
    lightModeRef.current = lightMode;
    if (deviceProfile === "partykeys36") {
      initLights(deviceProfile, lightMode);
      if (selectedScaleRef.current != null) applyScaleGuide(selectedScaleRef.current);
    }
  }, [applyScaleGuide, deviceProfile, initLights, lightMode]);

  useEffect(() => {
    moodRef.current = moodIndex;
    if (deviceProfile === "popupiano29") {
      initLights(deviceProfile, "palette71");
      if (selectedScaleRef.current != null) applyScaleGuide(selectedScaleRef.current);
    }
  }, [applyScaleGuide, deviceProfile, initLights, moodIndex]);

  useEffect(() => {
    engineRef.current?.setVolume(volume / 100);
  }, [volume]);

  useEffect(() => {
    engineRef.current?.setTone(tone);
  }, [tone]);

  useEffect(() => {
    engineRef.current?.setFx(reverb, delay, feedback);
  }, [delay, feedback, reverb]);

  useEffect(() => {
    if (loopStatus !== "recording") return;
    const duration = (60_000 / bpm) * 8;
    let frame = 0;
    const update = () => {
      const elapsed = performance.now() - loopStartRef.current;
      setLoopProgress(Math.min(1, elapsed / duration));
      if (elapsed >= duration) {
        const recorded = [...loopEventsRef.current];
        const balances = new Map<number, number>();
        recorded.forEach((event) => balances.set(event.note, (balances.get(event.note) || 0) + (event.type === "on" ? 1 : -1)));
        balances.forEach((count, note) => {
          for (let index = 0; index < count; index += 1) recorded.push({ type: "off", note, velocity: 0, at: duration - 8 });
        });
        recorded.sort((a, b) => a.at - b.at);
        loopEventsRef.current = recorded;
        setLoopEvents(recorded);
        setLoopStatus(recorded.some((event) => event.type === "on") ? "playing" : "idle");
        setStatusText(recorded.length ? "LOOP 已接管 · 8 拍无限循环" : "LOOP 没有录到音符");
        return;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [bpm, loopStatus]);

  useEffect(() => {
    if (loopStatus !== "playing" || !loopEvents.length) return;
    const duration = (60_000 / bpm) * 8;
    const timers = new Set<number>();
    const activeLoopNotes = new Set<number>();
    const origin = performance.now();
    let frame = 0;
    const scheduleCycle = () => {
      loopEvents.forEach((event) => {
        const timer = window.setTimeout(() => {
          const source = `loop-${event.note}`;
          if (event.type === "on") {
            activeLoopNotes.add(event.note);
            soundNoteOn(event.note, event.velocity, source);
          } else {
            activeLoopNotes.delete(event.note);
            soundNoteOff(event.note, source);
          }
        }, Math.min(duration - 1, event.at));
        timers.add(timer);
      });
      const next = window.setTimeout(scheduleCycle, duration);
      timers.add(next);
    };
    const progress = () => {
      setLoopProgress(((performance.now() - origin) % duration) / duration);
      frame = requestAnimationFrame(progress);
    };
    scheduleCycle();
    frame = requestAnimationFrame(progress);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      cancelAnimationFrame(frame);
      activeLoopNotes.forEach((note) => soundNoteOff(note, `loop-${note}`));
    };
  }, [bpm, loopEvents, loopStatus, soundNoteOff, soundNoteOn]);

  useEffect(() => {
    const keyMap: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };
    const down = (event: KeyboardEvent) => {
      if (event.repeat || !keyMap[event.key.toLowerCase()]) return;
      noteOn(keyMap[event.key.toLowerCase()], 94, "typing");
    };
    const up = (event: KeyboardEvent) => {
      if (!keyMap[event.key.toLowerCase()]) return;
      noteOff(keyMap[event.key.toLowerCase()], "typing");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [noteOff, noteOn]);

  useEffect(() => {
    const cleanup = () => { allLightsOff(); engineRef.current?.releaseAll(); };
    window.addEventListener("beforeunload", cleanup);
    return () => { window.removeEventListener("beforeunload", cleanup); cleanup(); };
  }, [allLightsOff]);

  useEffect(() => {
    if (!playing) return;
    let step = 0;
    const tick = () => {
      const index = step % 8;
      setActiveStep(index);
      const enabled = stepPattern[index];
      engineRef.current?.click(index === 0 || enabled);
      if (stepMode === "sequencer" && enabled) {
        const note = [60, 62, 64, 67, 69, 67, 64, 62][index];
        soundNoteOn(note, index === 0 ? 104 : 78, `step-${index}`);
        window.setTimeout(() => soundNoteOff(note, `step-${index}`), Math.max(80, 60_000 / bpm * 0.42));
      }
      step += 1;
    };
    tick();
    const timer = window.setInterval(tick, 60_000 / bpm);
    return () => { window.clearInterval(timer); setActiveStep(-1); };
  }, [bpm, playing, soundNoteOff, soundNoteOn, stepMode, stepPattern]);

  const profileLabel = deviceProfile === "partykeys36" ? "PK36" : deviceProfile === "popupiano29" ? "PP29" : "MIDI";
  const connectLabel = connection === "connected"
    ? text("重新扫描设备", "Rescan devices")
    : isNativeMidiBrowser()
      ? text("请点右下角“连接 MIDI 设备”", "Use “Connect MIDI Device” below")
      : text("连接音乐密码", "Connect PartyKeys");
  const statusClass = connection === "connected" ? "connected" : connection === "error" || connection === "unsupported" ? "error" : "";
  const blackPositions = useMemo(() => {
    return BLACK_NOTES.map((note) => {
      const whitesBefore = NOTES.filter((candidate) => candidate < note && ![1, 3, 6, 8, 10].includes(candidate % 12)).length;
      return { note, left: `${(whitesBefore / WHITE_NOTES.length) * 100}%` };
    });
  }, []);
  const scaleGuide = useMemo(() => {
    const colors = new Map<number, string>();
    if (selectedScale == null) return colors;
    const preset = SCALE_PRESETS[selectedScale];
    NOTES.forEach((note) => {
      const degree = preset.intervals.indexOf(note % 12);
      if (degree >= 0) colors.set(note, `rgb(${preset.colors[degree % preset.colors.length].join(",")})`);
    });
    return colors;
  }, [selectedScale]);

  const mood = MOODS[moodIndex];
  const panelContent = panel ? (
    <div className={`mini-panel mini-panel-${panel}`}>
      <div className="mini-panel-head">
        <b>{panel === "keys" ? "KEY BEHAVIOR" : panel === "loop" ? "8-BEAT LOOP" : panel === "fx" ? "FX RACK" : "CLOCK / STEP"}</b>
        <button aria-label="Close panel" onClick={() => setPanel(null)}>×</button>
      </div>
      {panel === "keys" && (
        <div className="key-mode-options">
          {([
            ["poly", text("主音", "Poly"), text("正常复音", "Full polyphony")],
            ["mono", text("旋律单音", "Mono"), text("后音切前音", "New note cuts old")],
            ["chord", text("和弦", "Chord"), text("单键三和弦", "One-key triad")],
          ] as const).map(([value, name, hint]) => (
            <button key={value} className={keyMode === value ? "panel-active" : ""} onClick={() => { setKeyMode(value); setStatusText(`${name} · ${hint}`); }}>
              <b>{name}</b><small>{hint}</small>
            </button>
          ))}
        </div>
      )}
      {panel === "loop" && (
        <div className="loop-panel">
          <div className="loop-meta"><span className={loopStatus}>{loopStatus === "recording" ? "● REC" : loopStatus === "playing" ? "▶ LOOP" : "○ READY"}</span><span>{loopEvents.filter((event) => event.type === "on").length} NOTES</span></div>
          <div className="loop-track">
            {Array.from({ length: 8 }, (_, index) => <i key={index} className={Math.floor(loopProgress * 8) === index ? "now" : ""} />)}
            <span style={{ width: `${loopProgress * 100}%` }} />
          </div>
          <div className="panel-actions">
            <button onClick={startLoopRecording}>{loopStatus === "recording" ? text("重新录制", "RETAKE") : text("录制 8 拍", "RECORD 8")}</button>
            <button onClick={() => stopLoop(false)}>{text("停止", "STOP")}</button>
            <button onClick={() => stopLoop(true)}>{text("清空", "CLEAR")}</button>
          </div>
        </div>
      )}
      {panel === "fx" && (
        <div className="fx-panel">
          {[[text("混响", "REVERB"), reverb, setReverb], [text("延迟", "DELAY"), delay, setDelay], [text("反馈", "FEEDBACK"), feedback, setFeedback]].map(([name, value, setter]) => (
            <label key={name as string}><span>{name as string}</span><input type="range" min="0" max="100" value={value as number} onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))} /><b>{value as number}</b></label>
          ))}
        </div>
      )}
      {panel === "step" && (
        <div className="step-panel">
          <button className={stepMode === "metronome" ? "panel-active" : ""} onClick={() => setStepMode("metronome")}><b>{text("节拍提示", "METRONOME")}</b><small>{text("滴 · 答 · 答 · 答", "Tick · tock · tock · tock")}</small></button>
          <button className={stepMode === "sequencer" ? "panel-active" : ""} onClick={() => setStepMode("sequencer")}><b>{text("八步音序", "8-STEP")}</b><small>{text("亮起的步会发声", "Lit steps play")}</small></button>
          <div><button onClick={() => setBpm((value) => Math.max(50, value - 2))}>−</button><strong>{bpm} BPM</strong><button onClick={() => setBpm((value) => Math.min(180, value + 2))}>＋</button></div>
          <button className={`step-run ${playing ? "panel-active" : ""}`} onClick={() => setPlaying((value) => !value)}>{playing ? text("暂停节拍", "PAUSE") : text("开始节拍", "START")}</button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <main className="app-shell" style={{ "--mood": `rgb(${mood.colors[2].join(",")})`, "--mood-soft": `rgba(${mood.colors[2].join(",")},.45)` } as React.CSSProperties}>
      <header className="topbar">
        <div className="locale-tools">
          <span className="signal-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <div className="locale-switch" role="group" aria-label={text("语言切换", "Language selector")}>
            <button className={locale === "zh" ? "active" : ""} aria-pressed={locale === "zh"} onClick={() => changeLocale("zh")}>中</button>
            <button className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>EN</button>
          </div>
        </div>
        <a className="wordmark" href="https://foundation.partykeys.ai" target="_blank" rel="noreferrer">
          <Image className="brand-logo" src="/brand-logo.png" alt="PartyKeys" width={32} height={32} priority />
          <span><b>{locale === "zh" ? "音乐密码" : "PARTYKEYS"}</b><small>PLAY LAB</small></span>
        </a>
        <div className="top-actions">
          <span className={`device-pill ${statusClass}`}><i /> {profileLabel} · {locale === "en" && deviceName === "未连接" ? "Not connected" : deviceName}</span>
          <button className="connect-button" onClick={() => void connectMidi(true)}>{connectLabel}</button>
          {appBluetooth ? (
            <a className="connect-button app-bluetooth" href="popumidi://action/bluetooth">{text("App 蓝牙连接", "App Bluetooth")}</a>
          ) : null}
        </div>
      </header>

      <section className="instrument" aria-label="PartyKeys Play Lab virtual instrument">
        <div className="top-deck">
          <section className="speaker-zone">
            <div className="speaker"><Image className="speaker-logo" src="/brand-logo.png" alt="PartyKeys" width={72} height={72} priority /></div>
          </section>

          <WaveDisplay activeNotes={activeNotes} bpm={bpm} mood={mood} keyMode={keyMode} engineRef={engineRef} />

          <div className="knob-row">
            <Knob label={text("音色", "TONE")} value={tone} color="#61d9aa" onChange={setTone} />
            <Knob label={text("混响", "REVERB")} value={reverb} color="#62c8e6" onChange={setReverb} />
            <Knob label={text("延迟", "DELAY")} value={delay} color="#f1b671" onChange={setDelay} />
            <Knob label={text("音量", "MASTER")} value={volume} color="#ff758a" onChange={setVolume} />
          </div>
        </div>

        <div className="pad-row">
          <div className="mode-pads">
            <button className={keyMode === "poly" ? "active-pad" : ""} onClick={() => { setKeyMode("poly"); setStatusText(text("正常演奏模式", "Polyphonic play mode")); }}><span>●</span><small>{text("正常演奏", "POLY")}</small></button>
            <button className={keyMode === "mono" ? "active-pad" : ""} onClick={() => { setKeyMode("mono"); setStatusText(text("单音旋律模式", "Monophonic melody mode")); }}><span>⌁</span><small>{text("单音旋律", "MONO")}</small></button>
            <button className={keyMode === "chord" ? "active-pad" : ""} onClick={() => { setKeyMode("chord"); setStatusText(text("单键和弦模式", "One-key chord mode")); }}><span>✣</span><small>{text("单键和弦", "CHORD")}</small></button>
          </div>
          <div className="sound-pads">
            {MOODS.map((item, index) => <button key={item.name} className={moodIndex === index ? "selected" : ""} style={{ "--pad-color": `rgb(${item.colors[2].join(",")})` } as React.CSSProperties} onClick={() => { setMoodIndex(index); setStatusText(locale === "zh" ? `${item.name}配色 · ${item.description}` : `${MOOD_EN[index].name} palette · ${MOOD_EN[index].description}`); }}><b>{locale === "zh" ? item.name : MOOD_EN[index].name}</b><small>{item.english}</small></button>)}
          </div>
          <div className="step-pads">
            {Array.from({ length: 8 }, (_, index) => <button key={index} aria-label={`第 ${index + 1} 拍${stepPattern[index] ? "，已开启" : "，已关闭"}`} className={`${stepPattern[index] ? "armed" : ""} ${playing && activeStep === index ? "step-on" : ""}`} onClick={() => setStepPattern((pattern) => pattern.map((value, candidate) => candidate === index ? !value : value))}><b>{index + 1}</b>{playing && activeStep === index ? <small>播放</small> : null}</button>)}
          </div>
          <button className={`more-button ${playing ? "step-playing" : ""}`} onClick={() => { setStepMode("sequencer"); setPlaying((value) => !value); setStatusText(playing ? text("八步节拍已暂停", "8-step pattern paused") : text("八步节拍播放中", "8-step pattern playing")); }}><b>{playing ? "Ⅱ" : "▶"}</b><small>{playing ? text("暂停", "PAUSE") : text("开始", "START")}</small></button>
        </div>

        <div className="lower-deck">
          <aside className="transport scale-bank" aria-label="音阶灯光预设">
            <div className="scale-grid">
              {SCALE_PRESETS.map((preset, index) => <button key={preset.name} className={selectedScale === index ? "scale-selected" : ""} style={{ "--scale-a": `rgb(${preset.colors[0].join(",")})`, "--scale-b": `rgb(${preset.colors[preset.colors.length - 1].join(",")})` } as React.CSSProperties} onClick={() => applyScaleGuide(index)}><b>{locale === "zh" ? preset.name : SCALE_EN[index]}</b><small>{preset.short}</small></button>)}
            </div>
          </aside>

          <div className="keyboard-wrap">
            <div className="keyboard-guide"><span><i className="guide-dot" />{text("音阶提示", "Scale guide")}</span><span><i className="press-dot" />{text("按下反馈", "Key feedback")}</span><strong>36 KEYS · C3–B5</strong><b>{connection === "connected" ? text("实体琴灯光已同步", "Hardware lights synced") : text("连接后同步实体琴灯光", "Connect to sync lights")}</b></div>
            <div className="keyboard" role="group" aria-label="36-key piano keyboard">
              <div className="white-keys">
                {WHITE_NOTES.map((note) => <button key={note} aria-label={noteLabel(note)} className={`${activeNotes.has(note) ? "pressed" : ""} ${scaleGuide.has(note) ? "guided" : ""}`} style={scaleGuide.has(note) ? { "--guide": scaleGuide.get(note) } as React.CSSProperties : undefined} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); noteOn(note); }} onPointerUp={() => noteOff(note)} onPointerCancel={() => noteOff(note)}><span>{note % 12 === 0 ? noteLabel(note) : ""}</span></button>)}
              </div>
              <div className="black-keys">
                {blackPositions.map(({ note, left }) => <button key={note} aria-label={noteLabel(note)} style={{ left, ...(scaleGuide.has(note) ? { "--guide": scaleGuide.get(note) } : {}) } as React.CSSProperties} className={`${activeNotes.has(note) ? "pressed" : ""} ${scaleGuide.has(note) ? "guided" : ""}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); noteOn(note); }} onPointerUp={() => noteOff(note)} onPointerCancel={() => noteOff(note)} />)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="statusbar">
        <span className={`live-dot ${statusClass}`}><i /> {statusText}</span>
        <span>{text("四层 Salamander C5 音源 · CC64 踏板 · Web MIDI / MidiBrowser", "4-layer Salamander C5 · CC64 pedal · Web MIDI / MidiBrowser")}</span>
        <span className="legal-links"><a href="/privacy">{text("隐私政策", "Privacy")}</a><a href="https://foundation.partykeys.ai" target="_blank" rel="noreferrer">Foundation ↗</a></span>
      </footer>
    </main>
  );
}
