'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchBlob } from './api';

// An <img src> pointing straight at the API cannot send the Bearer token, so
// the image is fetched through the authenticated client instead. The Blob is
// cached (not the object URL), so a thumbnail and its enlarged view share one
// download while each component owns — and revokes — its own object URL.
export function useAuthedObjectUrl(url: string | null): {
  src: string | null;
  isLoading: boolean;
  isError: boolean;
} {
  const blob = useQuery({
    queryKey: ['authed-blob', url],
    queryFn: () => fetchBlob(url!),
    enabled: url !== null,
    staleTime: Infinity,
  });
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!blob.data) {
      setSrc(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob.data);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob.data]);

  return { src, isLoading: blob.isLoading, isError: blob.isError };
}
