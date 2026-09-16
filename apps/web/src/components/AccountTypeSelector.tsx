export default function AccountTypeSelector({ seller, onChange }: { seller: boolean; onChange: (seller: boolean) => void }) {
  return <fieldset className="grid grid-cols-2 gap-2">
    <legend className="mb-2 text-sm font-semibold">Account type</legend>
    {[false, true].map((value) => <label key={String(value)} className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition-colors ${seller === value ? 'border-[var(--clr-accent)] bg-[var(--clr-accent-subtle)]' : 'border-[var(--clr-border)] hover:bg-[var(--clr-surface-2)]'}`}>
      <input type="radio" name="accountType" aria-label={value ? 'Shop Owner' : 'Customer'} checked={seller === value} onChange={() => onChange(value)} className="mt-1 shrink-0 accent-[var(--clr-accent)]" />
      <span><span className="block font-semibold">{value ? 'Shop Owner' : 'Customer'}</span><span className="mt-1 block text-xs text-[var(--clr-text-secondary)]">{value ? 'Manage your shop' : 'Find your next favorite'}</span></span>
    </label>)}
  </fieldset>;
}
