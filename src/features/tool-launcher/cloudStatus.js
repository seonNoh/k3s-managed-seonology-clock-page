export async function parseCloudStatusResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || `Cloud status request failed: ${response.status}`);
  }
  return {
    configured: Boolean(payload.configured),
    connected: Boolean(payload.connected),
  };
}
