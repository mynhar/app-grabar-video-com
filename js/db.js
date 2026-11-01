const DB_NAME = 'capas-videos';
const STORE = 'videos';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const listVideos = async () => (await run('readonly', (s) => s.getAll())).sort((a, b) => b.createdAt - a.createdAt);
export const countVideos = () => run('readonly', (s) => s.count());
export const getVideo = (id) => run('readonly', (s) => s.get(id));
export const saveVideo = (video) => run('readwrite', (s) => s.put(video));
export const deleteVideo = (id) => run('readwrite', (s) => s.delete(id));

export async function updateVideo(id, patch) {
  const video = await getVideo(id);
  if (!video) return null;
  Object.assign(video, patch);
  await saveVideo(video);
  return video;
}
