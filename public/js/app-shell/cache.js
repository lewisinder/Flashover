const userBrigadesCache = new Map();

export function invalidateUserBrigades(uid) {
  if (!uid) return;
  userBrigadesCache.delete(uid);
}

export async function getUserBrigades({ db, uid, force = false } = {}) {
  if (!db) throw new Error("Missing db");
  if (!uid) return [];

  const cached = userBrigadesCache.get(uid);
  if (!force && cached) return cached;

  const snapshot = await db.collection("users").doc(uid).collection("userBrigades").get();
  const brigades = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  userBrigadesCache.set(uid, brigades);
  return brigades;
}

