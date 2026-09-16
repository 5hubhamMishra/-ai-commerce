"use client";
export default function SellerError({ reset }: { reset: () => void }) {
  return <div className="p-8" role="alert"><p>Seller Center could not be loaded. Please try again.</p><button className="btn btn-secondary mt-4" onClick={reset}>Try again</button></div>;
}
