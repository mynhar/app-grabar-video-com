export const canRecordScreen = !!navigator.mediaDevices?.getDisplayMedia;
export const canDocPip = 'documentPictureInPicture' in window;
export const canRecord = 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

export const stopStream = (stream) => stream?.getTracks().forEach((t) => t.stop());

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

async function openDevice(kind, deviceId, base) {
  const constraints = (extra) => ({ [kind]: { ...base, ...extra } });
  try {
    return await navigator.mediaDevices.getUserMedia(constraints(deviceId ? { deviceId: { exact: deviceId } } : {}));
  } catch (err) {
    if (!deviceId || err.name === 'NotAllowedError') throw err;
    return navigator.mediaDevices.getUserMedia(constraints({}));
  }
}

export const openCamera = (deviceId) =>
  openDevice('video', deviceId, { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });

export const openMic = (deviceId) =>
  openDevice('audio', deviceId, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });

export class RecordingSession extends EventTarget {
  constructor({ mode, display, camera, mic, audioCtx }) {
    super();
    Object.assign(this, { mode, display, camera, mic, audioCtx });
    this.state = 'idle';
    this.chunks = [];
    this.elapsed = 0;
    this.startedAt = 0;
    const source = mode === 'camera' ? camera : display;
    source.getVideoTracks()[0].addEventListener('ended', () => this.dispatchEvent(new Event('ended')));
  }

  buildStream() {
    const video = (this.mode === 'camera' ? this.camera : this.display).getVideoTracks()[0];
    const sources = [this.mic, this.display].filter((s) => s?.getAudioTracks().length);
    let audio = [];
    if (sources.length === 1) {
      audio = sources[0].getAudioTracks();
    } else if (sources.length > 1) {
      const dest = this.audioCtx.createMediaStreamDestination();
      sources.forEach((s) => this.audioCtx.createMediaStreamSource(s).connect(dest));
      audio = dest.stream.getAudioTracks();
    }
    return new MediaStream([video, ...audio]);
  }

  start() {
    this.stream = this.buildStream();
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, { ...(mimeType && { mimeType }), videoBitsPerSecond: 3_000_000 });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(1000);
    this.startedAt = performance.now();
    this.state = 'recording';
  }

  get time() {
    return this.elapsed + (this.state === 'recording' ? performance.now() - this.startedAt : 0);
  }

  pause() {
    if (this.state !== 'recording') return;
    this.recorder.pause();
    this.elapsed += performance.now() - this.startedAt;
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.recorder.resume();
    this.startedAt = performance.now();
    this.state = 'recording';
  }

  stop() {
    const duration = this.time;
    this.state = 'stopped';
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'video/webm' });
        this.release();
        resolve({ blob, duration });
      };
      this.recorder.stop();
    });
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.state = 'stopped';
    this.release();
  }

  release() {
    [this.display, this.camera, this.mic].forEach(stopStream);
    if (this.audioCtx?.state !== 'closed') this.audioCtx?.close();
  }
}

function frameToDataURL(video) {
  if (!video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = Math.round(640 * (video.videoHeight / video.videoWidth));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export async function grabFrame(track) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  await video.play();
  await new Promise((r) => setTimeout(r, 700));
  const url = frameToDataURL(video);
  video.srcObject = null;
  return url;
}

export function thumbFromBlob(blob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    const done = (value) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    video.muted = true;
    video.preload = 'auto';
    video.onloadeddata = () => (video.currentTime = 0.2);
    video.onseeked = () => done(frameToDataURL(video));
    video.onerror = () => done(null);
    video.src = url;
  });
}
