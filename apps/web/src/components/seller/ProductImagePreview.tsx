"use client";
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { sellersApi } from '@ai-commerce/api-client';

export default function ProductImagePreview({ productId, url, alt }: { productId: string; url: string; alt: string }) {
  const uploadId = url.match(/^\/media\/products\/([a-f0-9-]+)\.webp$/)?.[1];
  const [preview, setPreview] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!uploadId) return;
    let active = true;
    sellersApi.preview(productId, uploadId).then((p) => { if (active) setPreview({ id: uploadId, url: p.dataUrl }); }).catch(() => {});
    return () => { active = false; };
  }, [productId, uploadId]);
  const source = uploadId ? (preview?.id === uploadId ? preview.url : '') : url;
  return source ? <Image src={source} alt={alt} width={160} height={160} unoptimized className="h-32 w-full rounded-lg object-contain" /> : <p className="flex h-32 items-center justify-center text-sm">Image preview unavailable</p>;
}
