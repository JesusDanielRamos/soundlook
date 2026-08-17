import { Injectable, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseClientService } from '../services/supabase-client.service';
import { Profile } from '../models/profile.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseClientService).client;

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);

  async init(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    await this.applySession(data.session);

    this.supabase.auth.onAuthStateChange((_event, session) => {
      void this.applySession(session);
    });
  }

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signUp(email: string, password: string, fullName: string) {
    const { error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
  }

  private async applySession(session: Session | null): Promise<void> {
    this.session.set(session);

    if (!session) {
      this.profile.set(null);
      return;
    }

    await this.loadProfile(session.user.id);
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, role, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      this.profile.set(null);
      return;
    }

    this.profile.set({
      id: data.id,
      fullName: data.full_name,
      role: data.role,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }
}
