const userBrigadesCache = new Map();

export function invalidateUserBrigades(uid) {
  if (!uid) return;
  userBrigadesCache.delete(uid);
}

async function fetchUserBrigadesFromApi(uid) {
  const user = window.firebase?.auth?.().currentUser;
  if (!user || user.uid !== uid) return null;

  const token = await user.getIdToken();
  const res = await fetch(`/api/data/${encodeURIComponent(uid)}/brigades?t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Failed to load brigades (${res.status})`);
  }
  return res.json();
}

export async function getUserBrigades({ db, uid, force = false } = {}) {
  if (!uid) return [];

  const cached = userBrigadesCache.get(uid);
  if (!force && cached) return cached;

  let brigades = null;
  try {
    brigades = await fetchUserBrigadesFromApi(uid);
  } catch (err) {
    console.warn("Falling back to Firestore brigade cache:", err);
  }

  if (!Array.isArray(brigades)) {
    if (!db) throw new Error("Missing db");
    const snapshot = await db.collection("users").doc(uid).collection("userBrigades").get();
    brigades = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  userBrigadesCache.set(uid, brigades);
  return brigades;
}
