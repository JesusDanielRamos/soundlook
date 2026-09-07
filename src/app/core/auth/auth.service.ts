import { Injectable, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseClientService } from '../services/supabase-client.service';
import { Profile } from '../models/profile.model';

interface SignUpDatosExtra {
  semester: number | null;
  hasDisability: boolean;
  disabilityDescription: string | null;
}

export interface ProfileUpdate {
  fullName: string;
  semester: number | null;
  hasDisability: boolean;
  disabilityDescription: string | null;
}

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

  async signUp(email: string, password: string, fullName: string, datosExtra: SignUpDatosExtra) {
    const { error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        // handle_new_user() (trigger de Postgres) lee estas mismas claves de
        // raw_user_meta_data para crear la fila en public.profiles — si cambias
        // los nombres aquí, hay que actualizar también la migración SQL.
        data: {
          full_name: fullName,
          semester: datosExtra.semester,
          has_disability: datosExtra.hasDisability,
          disability_description: datosExtra.disabilityDescription,
        },
      },
    });
    if (error) throw error;
  }

  // Reenvía el correo de confirmación de cuenta (Supabase lo manda solo una
  // vez al registrarse; si el usuario lo perdió o no llegó, esto genera otro).
  async resendConfirmationEmail(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  }

  // profiles_update_own_fullname permite al usuario actualizar su propia fila
  // (el nombre de la policy es engañoso: el "with check (id = auth.uid())"
  // aplica al UPDATE completo, no solo a full_name).
  async updateProfile(updates: ProfileUpdate): Promise<void> {
    const userId = this.session()?.user.id;
    if (!userId) throw new Error('No hay sesión activa.');

    const { error } = await this.supabase
      .from('profiles')
      .update({
        full_name: updates.fullName,
        semester: updates.semester,
        has_disability: updates.hasDisability,
        disability_description: updates.disabilityDescription,
      })
      .eq('id', userId);

    if (error) throw error;

    await this.loadProfile(userId);
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
      .select(
        'id, full_name, role, semester, has_disability, disability_description, created_at, updated_at',
      )
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
      semester: data.semester,
      hasDisability: data.has_disability,
      disabilityDescription: data.disability_description,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }
}
