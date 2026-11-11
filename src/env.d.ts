import type { StudioAPI } from '../shared/model';
declare global {
  interface Window {
    studio?: StudioAPI;
  }
}
