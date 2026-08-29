"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export default function FooterAccountLinks() {
  const user = useStore((s) => s.user);

  return (
    <>
      <Link
        href={user ? "/profile" : "/login"}
        className="text-sm text-stone-400 hover:text-white transition-colors duration-150 w-fit"
      >
        {user ? "My Profile" : "Sign In"}
      </Link>
      <Link
        href="/wishlist"
        className="text-sm text-stone-400 hover:text-white transition-colors duration-150 w-fit"
      >
        Wishlist
      </Link>
      <Link
        href="/cart"
        className="text-sm text-stone-400 hover:text-white transition-colors duration-150 w-fit"
      >
        Shopping Cart
      </Link>
      <Link
        href="/orders"
        className="text-sm text-stone-400 hover:text-white transition-colors duration-150 w-fit"
      >
        Your Orders
      </Link>
    </>
  );
}
