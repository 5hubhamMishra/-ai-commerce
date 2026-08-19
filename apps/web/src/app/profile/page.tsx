"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { buildProfile } from "@/lib/recommend";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";

export default function ProfilePage() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const events = useStore((s) => s.events);
  const logout = useStore((s) => s.logout);
  const personalizationEnabled = useStore((s) => s.personalizationEnabled);
  const setPersonalization = useStore((s) => s.setPersonalization);
  const clearActivity = useStore((s) => s.clearActivity);
  const hydrated = useStore((s) => s.hydrated);

  const profile = useMemo(() => buildProfile(events), [events]);
  const topCategories = Object.entries(profile.categoryAffinity).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topBrands = Object.entries(profile.brandAffinity).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <SkeletonText className="h-7 w-40 mb-5" />
        <div className="rounded-2xl border border-[var(--clr-border)] p-6 flex items-center gap-4">
          <SkeletonBlock className="w-12 h-12 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <SkeletonText className="h-4 w-1/3" />
            <SkeletonText className="h-3 w-1/2" />
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-[var(--clr-border)] p-6">
          <SkeletonText className="h-5 w-1/3 mb-4" />
          <SkeletonText className="h-16 w-full" />
        </div>
      </div>
    );
  }

  function exportData() {
    const data = { user, events, profile };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "veloura-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : "G";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-semibold">Your Profile</h1>

      <div className="mt-5 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 font-bold text-lg shrink-0">
          {initial}
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold">{user?.name ?? "Guest shopper"}</p>
          <p className="text-sm text-[var(--clr-text-secondary)] mt-0.5">{user?.email ?? "Not signed in"}</p>
        </div>
        <div>
          {user ? (
            <button onClick={logout} className="text-sm text-[var(--clr-error,red)] hover:underline">
              Sign out
            </button>
          ) : (
            <button onClick={() => router.push("/login")} className="text-sm text-amber-700 font-medium hover:underline">
              Sign in →
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
        <h2 className="font-display text-lg font-semibold">Shopping Profile</h2>
        <div className="flex gap-2 mt-2 flex-wrap">
          <span className="badge badge-subtle">Segment: {profile.segment}</span>
          <span className="badge badge-subtle">Stage: {profile.lifecycleStage}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--clr-text-disabled)' }}>Top interests</p>
            <div className="mt-2 space-y-3">
              {topCategories.length === 0 && <p className="text-sm text-[var(--clr-text-secondary)]">Not enough activity yet</p>}
              {topCategories.map(([cat, score]) => (
                <div key={cat}>
                  <p className="text-sm font-medium">{cat}</p>
                  <div className="mt-0.5 h-1 rounded-full bg-stone-100 overflow-hidden w-full">
                    <div className="h-1 rounded-full bg-amber-400" style={{ width: `${(score * 100).toFixed(0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--clr-text-disabled)' }}>Preferred brands</p>
            <div className="mt-2 space-y-3">
              {topBrands.length === 0 && <p className="text-sm text-[var(--clr-text-secondary)]">Not enough activity yet</p>}
              {topBrands.map(([b, score]) => (
                <div key={b}>
                  <p className="text-sm font-medium">{b}</p>
                  <div className="mt-0.5 h-1 rounded-full bg-stone-100 overflow-hidden w-full">
                    <div className="h-1 rounded-full bg-amber-400" style={{ width: `${(score * 100).toFixed(0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
        <h2 className="font-display text-lg font-semibold">Privacy & Personalization</h2>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--clr-text-primary)] font-medium">Personalization</p>
            <p className="text-xs text-[var(--clr-text-secondary)] mt-0.5">Use your activity to tailor recommendations and search.</p>
          </div>
          <button
            onClick={() => setPersonalization(!personalizationEnabled)}
            role="switch"
            aria-checked={personalizationEnabled}
            aria-label="Personalization"
            className="w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-200 shrink-0"
            style={{ backgroundColor: personalizationEnabled ? 'var(--clr-accent)' : 'var(--clr-surface-3,#d6d3d1)' }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
              style={{ transform: personalizationEnabled ? 'translateX(1.5rem)' : 'translateX(0.125rem)' }}
            />
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={exportData} className="btn btn-ghost text-xs px-3 py-2 border border-transparent">
            Export my data
          </button>
          <button
            onClick={() => confirm("Clear all browsing activity? This can't be undone.") && clearActivity()}
            className="btn text-xs px-3 py-2 rounded-xl border border-[var(--clr-border)] text-[var(--clr-error,red)] hover:bg-red-50 font-medium"
          >
            Delete activity history
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--clr-text-disabled)]">
          {events.length} activity events stored locally on this device. Nothing is sent to a server in this demo.
        </p>
      </div>
    </div>
  );
}
