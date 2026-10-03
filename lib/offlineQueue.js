const STORAGE_PREFIX = 'sme-tracker-offline-queue:';

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getOfflineEntries(userId) {
  if (!userId || typeof window === 'undefined') return [];
  const stored = window.localStorage.getItem(storageKey(userId));
  if (!stored) return [];

  const entries = JSON.parse(stored);
  if (!Array.isArray(entries)) {
    throw new Error('Offline queue data is invalid. Clear this browser’s site data before continuing.');
  }
  return entries;
}

export function enqueueOfflineEntry(userId, entry) {
  const entries = getOfflineEntries(userId);
  if (!entries.some((item) => item.id === entry.id)) {
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...entries, entry]));
  }
  window.dispatchEvent(new Event('offline-queue-updated'));
  return getOfflineEntries(userId);
}

export function removeOfflineEntry(userId, entryId) {
  const remaining = getOfflineEntries(userId).filter((entry) => entry.id !== entryId);
  window.localStorage.setItem(storageKey(userId), JSON.stringify(remaining));
  window.dispatchEvent(new Event('offline-queue-updated'));
  return remaining;
}

export async function syncOfflineEntries(userId, supabase) {
  if (!navigator.onLine) return { syncedIds: [], failed: [] };

  const entries = getOfflineEntries(userId);
  const syncedIds = [];
  const failed = [];

  for (const entry of entries) {
    let result;
    if (entry.type === 'sale') {
      result = await supabase.rpc('record_product_sale', entry.payload);
    } else if (entry.type === 'expense') {
      result = await supabase
        .from('expenses')
        .upsert(entry.payload, { onConflict: 'id', ignoreDuplicates: true });
    } else {
      failed.push({ id: entry.id, message: 'This offline entry has an unsupported type.' });
      continue;
    }

    if (result.error) {
      failed.push({ id: entry.id, message: result.error.message || 'Could not sync this entry.' });
    } else {
      syncedIds.push(entry.id);
    }
  }

  if (syncedIds.length) {
    const remaining = getOfflineEntries(userId).filter((entry) => !syncedIds.includes(entry.id));
    window.localStorage.setItem(storageKey(userId), JSON.stringify(remaining));
    window.dispatchEvent(new Event('offline-queue-updated'));
  }

  return { syncedIds, failed };
}
