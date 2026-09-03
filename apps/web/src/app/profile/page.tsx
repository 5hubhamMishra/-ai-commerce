"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useCategories } from "@/lib/hooks/useCategories";
import { useBrands } from "@/lib/hooks/useBrands";
import { LIFECYCLE_LABELS, SEGMENT_LABELS, rankAffinity } from "@/lib/behavioral-profile";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";
import { ApiError } from "@ai-commerce/api-client";

export default function ProfilePage() {
  const router = useRouter();
  const user = useStore((s) => s.user);
  const events = useStore((s) => s.events);
  const logout = useStore((s) => s.logout);
  const personalizationEnabled = useStore((s) => s.personalizationEnabled);
  const setPersonalization = useStore((s) => s.setPersonalization);
  const clearActivity = useStore((s) => s.clearActivity);
  const hydrated = useStore((s) => s.hydrated);
  const behavioralProfile = useStore((s) => s.behavioralProfile);
  const behavioralProfileStatus = useStore((s) => s.behavioralProfileStatus);
  const exportMyData = useStore((s) => s.exportMyData);
  const deleteAccount = useStore((s) => s.deleteAccount);

  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "loading">("idle");
  const [activityError, setActivityError] = useState(false);

  const categories = useCategories();
  const brands = useBrands();

  const topCategories = useMemo(() => {
    if (!behavioralProfile) return [];
    return rankAffinity(behavioralProfile.categoryAffinity)
      .slice(0, 5)
      .map(([id, score]) => [categories.find((c) => c.id === id)?.name ?? id, score] as const);
  }, [behavioralProfile, categories]);

  const topBrands = useMemo(() => {
    if (!behavioralProfile) return [];
    return rankAffinity(behavioralProfile.brandAffinity)
      .slice(0, 5)
      .map(([id, score]) => [brands.find((b) => b.id === id)?.name ?? id, score] as const);
  }, [behavioralProfile, brands]);

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

  async function exportData() {
    if (!user) return;
    const requestUserId = user.id;
    setExportStatus("loading");
    try {
      const data = await exportMyData();
      if (useStore.getState().user?.id !== requestUserId) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "veloura-my-data.json";
      a.click();
      // Let the browser start the download before releasing its object URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportStatus("idle");
    } catch {
      if (useStore.getState().user?.id === requestUserId) setExportStatus("error");
    }
  }

  async function handleDeleteAccount() {
    const requestUserId = user?.id;
    if (!requestUserId) return;
    setDeleteError(null);
    setDeleteStatus("loading");
    try {
      await deleteAccount(deletePassword);
      const currentUserId = useStore.getState().user?.id;
      if (currentUserId && currentUserId !== requestUserId) return;
      router.push("/");
    } catch (err) {
      if (useStore.getState().user?.id !== requestUserId) return;
      setDeleteStatus("idle");
      setDeleteError(
        err instanceof ApiError && err.status === 401
          ? "Incorrect password."
          : "Something went wrong. Please try again.",
      );
    }
  }

  async function handleClearActivity() {
    const requestUserId = user?.id ?? null;
    setActivityError(false);
    try {
      await clearActivity();
      if (requestUserId && useStore.getState().user?.id !== requestUserId) return;
    } catch {
      if (!requestUserId || useStore.getState().user?.id === requestUserId) {
        setActivityError(true);
      }
    }
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
            <button onClick={() => { void logout(); }} className="text-sm text-[var(--clr-error,red)] hover:underline">
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

        {!user ? (
          <p className="mt-3 text-sm text-[var(--clr-text-secondary)]">
            Sign in to build a real shopping profile from your browsing, cart, and order activity.
          </p>
        ) : behavioralProfileStatus === "loading" && !behavioralProfile ? (
          <SkeletonBlock className="mt-3 h-16 w-full" />
        ) : !behavioralProfile || behavioralProfile.eventCount === 0 ? (
          <p className="mt-3 text-sm text-[var(--clr-text-secondary)]">Not enough activity yet — browse a bit and check back.</p>
        ) : (
          <>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="badge badge-subtle">Segment: {SEGMENT_LABELS[behavioralProfile.segment]}</span>
              <span className="badge badge-subtle">Stage: {LIFECYCLE_LABELS[behavioralProfile.lifecycleStage]}</span>
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
          </>
        )}
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
          <button
            onClick={exportData}
            disabled={!user || exportStatus === "loading"}
            className="btn btn-ghost text-xs px-3 py-2 border border-transparent disabled:opacity-50"
          >
            {exportStatus === "loading" ? "Preparing export…" : "Export my data"}
          </button>
          <button
            onClick={() => { if (confirm("Clear all browsing activity? This can't be undone.")) void handleClearActivity(); }}
            className="btn text-xs px-3 py-2 rounded-xl border border-[var(--clr-border)] text-[var(--clr-error,red)] hover:bg-red-50 font-medium"
          >
            Delete activity history
          </button>
          {user && (
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="btn text-xs px-3 py-2 rounded-xl border border-[var(--clr-error,red)] text-[var(--clr-error,red)] hover:bg-red-50 font-medium"
            >
              Delete account
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-[var(--clr-text-disabled)]">
          {user
            ? `Export downloads everything the server holds about your account — profile, addresses, orders, activity, and more. "Delete account" erases your personal data and permanently deactivates sign-in; ${events.length} extra events are also stored locally on this device.`
            : `${events.length} activity events stored locally on this device — sign in to build a real, server-side shopping profile and access data export/account deletion.`}
        </p>
        {activityError && (
          <p className="mt-2 text-xs text-[var(--clr-error,red)]" role="alert">
            Couldn&apos;t delete activity history. Please try again.
          </p>
        )}
        {exportStatus === "error" && (
          <p className="mt-2 text-xs text-[var(--clr-error,red)]">Couldn&apos;t prepare your export. Please try again.</p>
        )}
      </div>

      {showDeleteDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete account"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => { if (deleteStatus !== "loading") setShowDeleteDialog(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg font-semibold">Delete your account?</h2>
            <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">
              This permanently erases your profile details, addresses, cart, wishlist, activity
              history, and ShopAI conversations, and signs you out everywhere. Past orders are kept
              as a financial record but are no longer linked to your real identity. This can&apos;t be
              undone.
            </p>
            <label htmlFor="delete-account-password" className="mt-4 block text-xs font-medium text-[var(--clr-text-secondary)]">
              Confirm your password
            </label>
            <input
              id="delete-account-password"
              type="password"
              autoFocus
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--clr-border)] px-3 py-2 text-sm"
            />
            {deleteError && <p className="mt-2 text-xs text-[var(--clr-error,red)]">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteDialog(false); setDeletePassword(""); setDeleteError(null); }}
                disabled={deleteStatus === "loading"}
                className="btn btn-ghost text-xs px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteStatus === "loading" || deletePassword.length === 0}
                className="btn text-xs px-4 py-2 rounded-xl bg-[var(--clr-error,red)] text-white font-medium disabled:opacity-50"
              >
                {deleteStatus === "loading" ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
