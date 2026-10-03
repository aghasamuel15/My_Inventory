'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOfflineEntries, removeOfflineEntry, syncOfflineEntries } from '../lib/offlineQueue';

export default function OfflineSyncStatus({ userId, supabase }) {
  const [isOnline, setIsOnline] = useState(true);
  const [entries, setEntries] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [showQueue, setShowQueue] = useState(false);
  const syncingRef = useRef(false);
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  const refreshQueue = useCallback(() => {
    if (!userId) return;
    try {
      setEntries(getOfflineEntries(userId));
    } catch (queueError) {
      setError(queueError.message || 'Could not read offline changes.');
    }
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    setError('');
    try {
      const result = await syncOfflineEntries(userId, supabaseRef.current);
      refreshQueue();
      if (result.failed.length) {
        setError(`Could not sync ${result.failed.length} change(s): ${result.failed[0].message}`);
      }
      if (result.syncedIds.length) {
        window.dispatchEvent(new Event('offline-entries-synced'));
      }
    } catch (syncError) {
      setError(syncError.message || 'Could not sync offline changes.');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refreshQueue, userId]);

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) syncNow();
    }

    setIsOnline(navigator.onLine);
    refreshQueue();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    window.addEventListener('offline-queue-updated', refreshQueue);
    if (navigator.onLine) syncNow();
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('offline-queue-updated', refreshQueue);
    };
  }, [refreshQueue, syncNow]);

  if (!userId || (isOnline && entries.length === 0 && !error)) return null;

  return (
    <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${isOnline ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{isOnline ? 'Changes waiting to sync' : 'You’re offline'}</p>
          <p className="mt-0.5 text-xs">
            {entries.length ? `${entries.length} saved change(s) on this device. They will sync when you reconnect.` : 'New sales and expenses can be saved on this device until you reconnect.'}
          </p>
        </div>
        <div className="flex gap-2">
          {entries.length > 0 && (
            <button type="button" onClick={() => setShowQueue((open) => !open)} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm">
              {showQueue ? 'Hide saved' : 'Review saved'}
            </button>
          )}
          {isOnline && entries.length > 0 && (
            <button type="button" onClick={syncNow} disabled={syncing} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm disabled:opacity-60">
              {syncing ? 'Syncing…' : `Sync now (${entries.length})`}
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      {showQueue && entries.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-current/10 pt-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 text-xs">
              <span>{entry.type === 'sale' ? 'Sale' : 'Expense'} · {new Date(entry.createdAt).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Remove this unsynced change from this device?')) {
                    try {
                      setEntries(removeOfflineEntry(userId, entry.id));
                    } catch (removeError) {
                      setError(removeError.message || 'Could not remove the saved change.');
                    }
                  }
                }}
                className="font-semibold text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
