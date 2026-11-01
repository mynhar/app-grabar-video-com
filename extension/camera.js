// Runs inside the bubble's iframe with the extension's origin, so the camera uses the permission granted to
// Capas once (permission.html) instead of asking every website. Device ids differ per origin, so the camera
// chosen in the app is matched by its label.
const label = new URLSearchParams(location.search).get('label');
const video = document.querySelector('video');
const report = (error) => parent.postMessage({ source: 'capas-cam', error }, '*');
const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

async function openCamera() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const match = label && devices.find((d) => d.kind === 'videoinput' && d.label === label);
  if (match) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { ...base, deviceId: { exact: match.deviceId } } });
    } catch {}
  }
  return navigator.mediaDevices.getUserMedia({ video: base });
}

function errorCode(err) {
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  if (policy && !policy.allowsFeature('camera')) return 'blocked';
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return 'permission';
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'missing';
  return 'busy';
}

openCamera()
  .then((stream) => { video.srcObject = stream; report(null); })
  .catch((err) => report(errorCode(err)));
