import type { VoiceUploadResponse } from '../types';

const API_BASE = '/api';

export async function uploadVoice(
  blueprintId: string,
  blob: Blob,
  duration: number,
  onProgress?: (percent: number) => void,
): Promise<VoiceUploadResponse> {
  const formData = new FormData();
  formData.append('blueprintId', blueprintId);
  formData.append('duration', String(duration));
  formData.append('file', blob, `voice_${Date.now()}.webm`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', `${API_BASE}/voices/upload`, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as VoiceUploadResponse);
        } catch (e) {
          reject(new Error('Invalid response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Aborted'));

    xhr.send(formData);
  });
}

export function getVoiceUrl(voiceId: string): string {
  return `${API_BASE}/voices/${voiceId}`;
}
