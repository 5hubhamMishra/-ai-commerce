"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "@/lib/store";

const SearchIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const HeartIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
  </svg>
);

const CartIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="9" cy="21" r="1"></circle>
    <circle cx="20" cy="21" r="1"></circle>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
  </svg>
);

const UserIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const MenuIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const Badge = ({ count }: { count: number }) => {
  if (count === 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 h-4 min-w-[16px] rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1 bg-[var(--clr-accent)]">
      {count > 9 ? '9+' : count}
    </span>
  );
};

export default function Navbar() {
  const [q, setQ] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputId = useId();
  const mobileSearchInputId = useId();

  const cartCount = useStore((s) => s.serverCart?.itemCount ?? 0);
  const wishlistCount = useStore((s) => s.serverWishlist?.items.length ?? 0);
  const user = useStore((s) => s.user);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close the mobile drawer when navigation actually changes — adjusted
  // during render (React's own recommended pattern for "reset state when a
  // value changes") rather than in an effect, which would need an extra
  // render pass and synchronously trigger a cascading re-render for no
  // benefit here.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // Drawer a11y: lock background scroll, close on Escape, move focus into
  // the panel on open and back to the trigger button on close — a mobile
  // nav overlay is a modal dialog and should behave like one for keyboard
  // and screen-reader users, not just visually.
  useEffect(() => {
    if (!mobileOpen) return;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) {
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      setMobileOpen(false);
    }
  };

  const navLinks = [
    { name: 'Shop', href: '/shop' },
    { name: 'For You', href: '/recommendations' },
    { name: 'ShopAI', href: '/ai-shopping' },
    { name: 'Compare', href: '/compare' },
  ];

  return (
    <>
      <header 
        className="sticky top-0 z-40 bg-[var(--clr-bg)] border-b border-[var(--clr-border)]"
        style={{ 
          boxShadow: scrolled ? 'var(--shadow-nav)' : 'none',
          transition: 'box-shadow 300ms ease'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/" className="font-display text-xl font-bold tracking-tight text-[var(--clr-text-primary)]">
              Veloura
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(link => {
                const isActive = pathname === link.href;
                return (
                  <Link 
                    key={link.name} 
                    href={link.href}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                      isActive 
                        ? 'bg-[var(--clr-accent-subtle)] text-[var(--clr-accent)]' 
                        : 'text-[var(--clr-text-secondary)] hover:bg-[var(--clr-surface-2)]'
                    }`}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </nav>

            <form onSubmit={handleSearch} className="ml-auto flex-1 max-w-sm hidden sm:block relative">
              <label htmlFor={searchInputId} className="sr-only">
                Search products
              </label>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-4 w-4 text-[var(--clr-text-secondary)]" />
              </div>
              <input
                id={searchInputId}
                type="search"
                placeholder="Search products..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-full border border-[var(--clr-border)] bg-[var(--clr-surface-2)] text-sm outline-none transition-all duration-200 placeholder:text-[var(--clr-text-disabled)]"
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--clr-accent)';
                  e.target.style.boxShadow = '0 0 0 3px var(--clr-accent-subtle)';
                  e.target.style.backgroundColor = 'white';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--clr-border)';
                  e.target.style.boxShadow = 'none';
                  e.target.style.backgroundColor = 'var(--clr-surface-2)';
                }}
              />
            </form>

            <div className="flex items-center gap-1">
              <Link
                href="/wishlist"
                aria-label={`Wishlist${wishlistCount > 0 ? ` (${wishlistCount} items)` : ""}`}
                className="hidden sm:flex relative rounded-lg p-2 hover:bg-stone-100 text-[var(--clr-text-secondary)] transition-colors"
              >
                <HeartIcon className="h-5 w-5" />
                <Badge count={wishlistCount} />
              </Link>

              <Link
                href="/cart"
                aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ""}`}
                className="relative rounded-lg p-2 hover:bg-stone-100 text-[var(--clr-text-secondary)] transition-colors"
              >
                <CartIcon className="h-5 w-5" />
                <Badge count={cartCount} />
              </Link>
              
              <Link href={user ? "/profile" : "/login"} className="hidden sm:flex items-center gap-1.5 ml-1 px-3 py-1.5 rounded-full border border-[var(--clr-border)] text-sm font-medium text-[var(--clr-text-secondary)] hover:border-[var(--clr-accent)] hover:text-[var(--clr-accent)] transition-colors">
                <UserIcon className="h-4 w-4" />
                {user ? user.name.split(' ')[0] : 'Sign in'}
              </Link>
              
              <button
                ref={menuButtonRef}
                className="md:hidden rounded-lg p-2 hover:bg-stone-100 text-[var(--clr-text-secondary)] transition-colors"
                onClick={() => setMobileOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav-drawer"
                aria-label="Open menu"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-fadeIn"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-nav-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className="fixed inset-y-0 right-0 z-50 w-72 flex flex-col bg-[var(--clr-surface)] shadow-[var(--shadow-modal)] animate-slideInRight outline-none"
          >
            <div className="flex justify-between items-center p-4 border-b border-[var(--clr-border)]">
              <span className="font-display text-lg font-semibold text-[var(--clr-text-primary)]">Menu</span>
              <button 
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--clr-surface-2)] text-[var(--clr-text-secondary)]"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-1">
              {navLinks.map(link => {
                const isActive = pathname === link.href;
                return (
                  <Link 
                    key={link.name} 
                    href={link.href}
                    className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium ${
                      isActive 
                        ? 'bg-[var(--clr-accent-subtle)] text-[var(--clr-accent)]' 
                        : 'text-[var(--clr-text-secondary)] hover:bg-[var(--clr-surface-2)]'
                    }`}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </div>
            
            <div className="h-px bg-[var(--clr-border)] mx-4 my-2" />
            
            <div className="p-4 space-y-1">
              <Link href="/wishlist" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--clr-text-secondary)] hover:bg-[var(--clr-surface-2)]">
                <div className="flex items-center gap-3">
                  <HeartIcon className="h-5 w-5" />
                  Wishlist
                </div>
                {wishlistCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--clr-accent)] text-[10px] font-bold text-white">
                    {wishlistCount}
                  </span>
                )}
              </Link>
              
              <Link href="/cart" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--clr-text-secondary)] hover:bg-[var(--clr-surface-2)]">
                <div className="flex items-center gap-3">
                  <CartIcon className="h-5 w-5" />
                  Cart
                </div>
                {cartCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--clr-accent)] text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              
              <Link href={user ? "/profile" : "/login"} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--clr-text-secondary)] hover:bg-[var(--clr-surface-2)]">
                <UserIcon className="h-5 w-5" />
                {user ? user.name : 'Sign in'}
              </Link>
            </div>
            
            <div className="mt-auto p-4 border-t border-[var(--clr-border)]">
              <form onSubmit={handleSearch} className="relative">
                <label htmlFor={mobileSearchInputId} className="sr-only">
                  Search products
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-[var(--clr-text-secondary)]" />
                </div>
                <input
                  id={mobileSearchInputId}
                  type="search"
                  placeholder="Search products..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--clr-border)] bg-[var(--clr-surface-2)] text-sm outline-none transition-all duration-200 placeholder:text-[var(--clr-text-disabled)] focus:border-[var(--clr-accent)] focus:bg-white focus:shadow-[0_0_0_3px_var(--clr-accent-subtle)]"
                />
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
