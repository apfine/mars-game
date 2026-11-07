import { validateSave } from './repository.js';

export const CLOUD_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function mergeMonotonic(chosen, other) {
  const next = structuredClone(validateSave(chosen));
  if (!other) return next;
  validateSave(other);
  for (const field of ['discoveries', 'badges', 'harvestedCrops'])
    next[field] = [...new Set([...next[field], ...other[field]])];
  next.eventKeys = [...new Set([...other.eventKeys, ...next.eventKeys])].slice(-5000);
  // Balances, buildings, crops, spending, and objective rewards remain wholly
  // on the selected branch. A union here would create free resources.
  return next;
}

export class SupabaseCareerAdapter {
  constructor(client) { this.client = client; }
  static async create() {
    if (!CLOUD_CONFIGURED) throw new Error('Account sync is not configured.');
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { storageKey: 'dunes-career-auth', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    });
    return new SupabaseCareerAdapter(client);
  }
  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }
  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user || !data.session) throw new Error('Check your email, then sign in to activate sync.');
    return data.user;
  }
  async currentUser() { const { data } = await this.client.auth.getUser(); return data?.user || null; }
  async signOut() { const { error } = await this.client.auth.signOut(); if (error) throw error; }
  async read(userId) {
    const { data, error } = await this.client.from('career_saves')
      .select('revision,generation,payload,updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...data, payload: validateSave(data.payload) };
  }
  async compareAndSwap(expectedRevision, state) {
    validateSave(state);
    const { data, error } = await this.client.rpc('career_save_cas', {
      expected_revision: expectedRevision, new_generation: state.generation, new_payload: state
    });
    if (error) {
      if (error.code === 'P0001') { const conflict = new Error('Cloud save changed on another device.'); conflict.conflict = true; throw conflict; }
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !Number.isFinite(Number(row.revision))) throw new Error('Cloud save response was incomplete.');
    return Number(row.revision);
  }
}

export class CloudSyncCoordinator {
  constructor(adapter) {
    this.adapter = adapter;
    this.accountId = null;
    this.generation = null;
    this.remoteRevision = 0;
    this.status = 'Local Only';
    this.inFlight = false;
  }
  attach(accountId, generation, remoteRevision = 0) {
    this.accountId = accountId;
    this.generation = generation;
    this.remoteRevision = remoteRevision;
    this.status = 'Sync Pending';
  }
  detach() { this.accountId = null; this.generation = null; this.status = 'Local Only'; }
  async flush(repository, state) {
    if (!this.accountId || repository.namespace !== `account:${this.accountId}` || state.generation !== this.generation)
      return { status: this.status, ignored: true };
    if (this.inFlight) return { status: this.status, busy: true };
    const pending = await repository.loadPendingSync();
    if (!pending || pending.accountId !== this.accountId || pending.generation !== this.generation) {
      this.status = 'Synced'; return { status: this.status };
    }
    this.inFlight = true;
    const accountId = this.accountId, generation = this.generation;
    try {
      const latest = (await repository.load()).state;
      if (!latest || latest.generation !== generation) return { status: this.status, ignored: true };
      const nextRevision = await this.adapter.compareAndSwap(this.remoteRevision, latest);
      if (this.accountId !== accountId || this.generation !== generation) return { status: this.status, ignored: true };
      this.remoteRevision = nextRevision;
      await repository.clearPendingSync(generation, latest.revision);
      const newer = await repository.loadPendingSync();
      this.status = newer ? 'Sync Pending' : 'Synced';
      return { status: this.status, revision: nextRevision };
    } catch (error) {
      this.status = error.conflict ? 'Sync Failed' : globalThis.navigator?.onLine === false ? 'Offline' : 'Sync Failed';
      return { status: this.status, error };
    } finally { this.inFlight = false; }
  }
}
