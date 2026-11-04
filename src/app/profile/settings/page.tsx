"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import type { IUserAddress } from "@/models/User";
import { useAuth } from "@/components/auth/AuthProvider";

type ProfileData = { name: string; email: string; phone?: string; addresses: IUserAddress[] };
type AddressDraft = Omit<IUserAddress, "id">;
const emptyAddress: AddressDraft = { name: "", phone: "", address: "", city: "", postalCode: "" };

export default function ProfileSettingsPage() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<ProfileData>({ name: user?.name ?? "", email: user?.email ?? "", phone: "", addresses: [] });
  const [draft, setDraft] = useState<AddressDraft>(emptyAddress);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<ProfileData>("/api/profile")
      .then((data) => { if (active) setProfile(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setProfile(await apiRequest<ProfileData>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: profile.name, phone: profile.phone ?? "" }),
      }));
      await refresh();
      setNotice("Profile saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const address = await apiRequest<IUserAddress>("/api/profile/addresses", { method: "POST", body: JSON.stringify(draft) });
      setProfile((current) => ({ ...current, addresses: [...current.addresses, address] }));
      setDraft(emptyAddress);
      setNotice("Address saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this address.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAddress(id: string) {
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/profile/addresses/${encodeURIComponent(id)}`, { method: "DELETE" });
      setProfile((current) => ({ ...current, addresses: current.addresses.filter((address) => address.id !== id) }));
      setNotice("Address removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this address.");
    }
  }

  return (
    <main className="space-y-4 px-4 pb-8 pt-5">
      <header className="flex items-center gap-3"><Link href="/profile" aria-label="Back to profile" className="flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"><ArrowLeft size={19} /></Link><div><h1 className="text-xl font-semibold text-ink">Settings</h1><p className="text-xs text-ink-muted">Manage profile and saved addresses</p></div></header>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}
      {loading ? <p role="status" className="rounded-2xl bg-white p-5 text-sm text-ink-muted">Loading settings…</p> : (
        <>
          <form onSubmit={saveProfile} className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">Profile details</h2>
            <label className="block text-xs font-medium text-ink">Name<input required maxLength={100} value={profile.name} onChange={(event) => setProfile((value) => ({ ...value, name: event.target.value }))} className="form-input mt-1" /></label>
            <label className="block text-xs font-medium text-ink">Email<input readOnly value={profile.email} className="form-input mt-1 opacity-70" /></label>
            <label className="block text-xs font-medium text-ink">Phone<input maxLength={30} value={profile.phone ?? ""} onChange={(event) => setProfile((value) => ({ ...value, phone: event.target.value }))} className="form-input mt-1" /></label>
            <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save profile"}</button>
          </form>
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">Saved addresses</h2>
            {profile.addresses.length ? profile.addresses.map((address) => (
              <article key={address.id} className="flex items-start gap-3 rounded-xl bg-mint-50 p-3">
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink">{address.name} · {address.phone}</p><p className="mt-1 text-xs text-ink-muted">{address.address}, {address.city} {address.postalCode}</p></div>
                <button type="button" aria-label={`Remove ${address.name} address`} onClick={() => void deleteAddress(address.id)} className="flex size-9 shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger/10"><Trash2 size={16} /></button>
              </article>
            )) : <p className="text-xs text-ink-muted">No saved addresses yet.</p>}
            <form onSubmit={addAddress} className="space-y-2 border-t border-border pt-3">
              <h3 className="text-xs font-semibold text-ink">Add an address</h3>
              {(["name", "phone", "address", "city", "postalCode"] as const).map((field) => <label key={field} className="block text-xs font-medium capitalize text-ink">{field === "postalCode" ? "Postal code" : field}<input required maxLength={field === "address" ? 300 : 100} value={draft[field]} onChange={(event) => setDraft((value) => ({ ...value, [field]: event.target.value }))} className="form-input mt-1" /></label>)}
              <button type="submit" disabled={busy} className="min-h-11 rounded-full border border-primary px-5 text-sm font-semibold text-primary disabled:opacity-60">{busy ? "Saving…" : "Save address"}</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
