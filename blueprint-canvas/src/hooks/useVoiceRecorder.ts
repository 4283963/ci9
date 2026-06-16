import { useCallback, useEffect, useRef, useState } from 'react';

export interface RecordingState {
  isRecording: boolean;
  duration: number;
  amplitude: number;
  error: string | null;
}

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
  },
};

export function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    amplitude: 0,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const amplitudeRafRef = useRef<number | null>(null);

  const startRecording = useCallback(async () => {
    if (state.isRecording) return;
    setState({ isRecording: false, duration: 0, amplitude: 0, error: null });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(DEFAULT_CONSTRAINTS);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
            ? '请允许麦克风权限以录制语音批注'
            : e.message
          : '无法访问麦克风';
      setState({ isRecording: false, duration: 0, amplitude: 0, error: msg });
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      try {
        recorder = new MediaRecorder(stream);
      } catch (e2) {
        stopStream(stream);
        setState({
          isRecording: false,
          duration: 0,
          amplitude: 0,
          error: '当前浏览器不支持录音',
        });
        return;
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onerror = (e) => {
      setState((s) => ({ ...s, error: (e as unknown as { message?: string }).message || '录音错误' }));
    };

    mediaRecorderRef.current = recorder;
    recorder.start(100);
    startTimeRef.current = Date.now();

    startAmplitudeMonitor(stream);

    durationTimerRef.current = window.setInterval(() => {
      setState((s) => ({
        ...s,
        duration: Math.round((Date.now() - startTimeRef.current) / 1000),
      }));
    }, 250);

    setState({ isRecording: true, duration: 0, amplitude: 0, error: null });
  }, [state.isRecording]);

  const stopRecording = useCallback((): Promise<{ blob: Blob; duration: number } | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const stream = streamRef.current;
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);

      const finish = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder?.mimeType || 'audio/webm',
        });
        stopStream(stream);
        cleanup();
        setState({ isRecording: false, duration: 0, amplitude: 0, error: null });
        if (blob.size < 512 || duration < 1) {
          resolve(null);
        } else {
          resolve({ blob, duration });
        }
      };

      cleanup();

      if (!recorder || recorder.state === 'inactive') {
        finish();
        return;
      }

      recorder.onstop = finish;
      try {
        recorder.stop();
      } catch (e) {
        finish();
      }
    });
  }, []);

  const cancelRecording = useCallback(() => {
    cleanup();
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.onstop = () => stopStream(stream);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else stopStream(stream);
    } catch (e) {
      stopStream(stream);
    }
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    streamRef.current = null;
    setState({ isRecording: false, duration: 0, amplitude: 0, error: null });
  }, []);

  function cleanup() {
    if (durationTimerRef.current != null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (amplitudeRafRef.current != null) {
      cancelAnimationFrame(amplitudeRafRef.current);
      amplitudeRafRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }

  function startAmplitudeMonitor(stream: MediaStream) {
    try {
      const AC: typeof AudioContext =
        (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setState((s) => (s.isRecording ? { ...s, amplitude: rms } : s));
        amplitudeRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* 不支持分析器也能录音，跳过 */
    }
  }

  useEffect(() => {
    return () => {
      cleanup();
      stopStream(streamRef.current);
    };
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}

function pickMimeType(): string | null {
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== 'function') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const m of candidates) {
    try {
      if (MR.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return null;
}
