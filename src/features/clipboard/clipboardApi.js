import { API_BASE, requestJson, apiFetch } from '../../api/client.js';

function segment(value) {
  return encodeURIComponent(String(value));
}

async function readErrorMessage(response, fallback) {
  const data = await response.json().catch(() => null);
  return (data && typeof data.error === 'string' && data.error) || fallback;
}

export function clipboardImageUrl(id) {
  return `${API_BASE}/api/clipboard/images/${segment(id)}`;
}

export function listClipboardImages(options = {}) {
  return requestJson('/api/clipboard/images', options);
}

export async function uploadClipboardImage(blob) {
  const response = await apiFetch(`${API_BASE}/api/clipboard/images`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': blob.type },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `이미지 저장이 상태 ${response.status}로 실패했습니다.`));
  }
  return response.json();
}

export async function deleteClipboardImage(id) {
  const response = await apiFetch(clipboardImageUrl(id), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `이미지 삭제가 상태 ${response.status}로 실패했습니다.`));
  }
}

export async function fetchClipboardImageBlob(id) {
  const response = await apiFetch(clipboardImageUrl(id));
  if (!response.ok) {
    throw new Error(`이미지를 불러오지 못했습니다 (상태 ${response.status}).`);
  }
  return response.blob();
}
