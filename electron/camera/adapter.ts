export interface CameraDevice {
  id: string;
  name: string;
  adapter: string;
}
export interface CameraCapabilities {
  liveView: boolean;
  battery: boolean;
  tetheredCapture: boolean;
}
export interface CameraStatus {
  connected: boolean;
  ready: boolean;
  battery?: number;
  error?: string;
}
export interface CapturedPhoto {
  bytes: Uint8Array;
  mimeType: 'image/jpeg';
  capturedAt: string;
}
/** Implementations own their SDK and USB lifecycle. Capture must honor cancellation. */
export interface CameraAdapter {
  readonly id: string;
  readonly demo: boolean;
  detect(signal: AbortSignal): Promise<CameraDevice[]>;
  connect(deviceId: string, signal: AbortSignal): Promise<CameraCapabilities>;
  disconnect(): Promise<void>;
  status(): Promise<CameraStatus>;
  startLiveView(
    onFrame: (jpeg: Uint8Array) => void,
    onError: (error: Error) => void,
  ): Promise<void>;
  stopLiveView(): Promise<void>;
  capture(signal: AbortSignal): Promise<CapturedPhoto>;
}
