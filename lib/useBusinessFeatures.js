'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

export default function useBusinessFeatures() {
  const [features, setFeatures] = useState();

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function loadFeatures() {
      const { data, error } = await supabase.rpc('get_business_features');
      if (error) {
        console.error('Could not load business feature access:', error.message);
        if (active) setFeatures(null);
        return;
      }
      if (active) setFeatures(Array.isArray(data) ? data : []);
    }

    loadFeatures();
    return () => {
      active = false;
    };
  }, []);

  return features;
}
