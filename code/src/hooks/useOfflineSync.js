import { useEffect, useState } from 'react';
import { getPendingMutations, clearMutation } from '../lib/offlineSync';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = async () => {
      setIsOnline(true);
      toast.info("Connection restored. Syncing offline data...");
      
      try {
        const pending = await getPendingMutations();
        if (pending.length === 0) return;

        let successCount = 0;
        
        for (const item of pending) {
          // Attempt to flush the mutation to Supabase
          // Expected endpoint format: "table_name/insert" or "rpc/function_name"
          const [table, action] = item.endpoint.split('/');
          
          let error = null;
          if (action === 'insert') {
            const res = await supabase.from(table).insert(item.payload);
            error = res.error;
          } else if (action === 'update') {
            const res = await supabase.from(table).update(item.payload.data).eq('id', item.payload.id);
            error = res.error;
          }

          if (!error) {
            await clearMutation(item.id);
            successCount++;
          } else {
            console.error(`Failed to sync offline item ${item.id}:`, error);
          }
        }

        if (successCount > 0) {
          toast.success(`Successfully synced ${successCount} offline actions.`);
        }
      } catch (err) {
        console.error("Offline sync error", err);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You are offline. Changes will be saved locally and synced later.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
