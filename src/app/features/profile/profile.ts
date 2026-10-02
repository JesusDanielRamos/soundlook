import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/user-role.model';

const ROLE_LABELS: Record<UserRole, string> = {
  estudiante: 'Estudiante',
  docente: 'Docente',
  administrador: 'Administrador',
};

@Component({
  selector: 'app-profile',
  imports: [FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly auth = inject(AuthService);

  protected readonly semesters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  readonly profile = this.auth.profile;
  readonly email = computed(() => this.auth.session()?.user.email ?? '');
  readonly roleLabel = computed(() => {
    const role = this.profile()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  readonly initial = computed(() => (this.profile()?.fullName || this.email() || '?').charAt(0).toUpperCase());

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedJustNow = signal(false);

  // Campos editables — se copian del perfil solo al entrar en modo edición,
  // para no mutar auth.profile() mientras el usuario escribe.
  protected readonly fullName = signal('');
  protected readonly semester = signal<number | null>(null);
  protected readonly hasDisability = signal(false);
  protected readonly disabilityDescription = signal<string | null>(null);

  startEditing(): void {
    const profile = this.profile();
    if (!profile) return;

    this.fullName.set(profile.fullName ?? '');
    this.semester.set(profile.semester);
    this.hasDisability.set(profile.hasDisability);
    this.disabilityDescription.set(profile.disabilityDescription);
    this.error.set(null);
    this.savedJustNow.set(false);
    this.editing.set(true);
  }

  cancelEditing(): void {
    this.editing.set(false);
    this.error.set(null);
  }

  toggleDisability(checked: boolean): void {
    this.hasDisability.set(checked);
    if (!checked) {
      this.disabilityDescription.set(null);
    }
  }

  async onSubmit(form: NgForm): Promise<void> {
    if (form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      await this.auth.updateProfile({
        fullName: this.fullName().trim(),
        semester: this.semester(),
        hasDisability: this.hasDisability(),
        disabilityDescription: this.hasDisability() ? this.disabilityDescription() : null,
      });
      this.editing.set(false);
      this.savedJustNow.set(true);
    } catch {
      this.error.set('No se pudo guardar tu perfil. Intenta de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }
}
