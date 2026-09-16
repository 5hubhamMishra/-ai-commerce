"use client";
import { useEffect, useState } from 'react';
import { request } from '@ai-commerce/api-client';
import { useStore } from '@/lib/store';

export function useSellerResource<T>(path: string) {
  const authStatus = useStore((s) => s.authStatus);
  const [result, setResult] = useState<{ path: string; data?: T; error?: string } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let active = true;
    request<T>(path).then((data) => { if (active) setResult({ path, data }); }).catch((error: Error) => { if (active) setResult({ path, error: error.message }); });
    return () => { active = false; };
  }, [path, revision, authStatus]);
  return { data: result?.path === path ? result.data : undefined, error: authStatus === 'unauthenticated' ? 'Session expired. Please sign in again.' : result?.path === path ? result.error : undefined, reload: () => setRevision((n) => n + 1) };
}
