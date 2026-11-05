import { DatePipe } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CoursesService } from '../courses.service';
import { TranscriptionSessionSummary, TranscriptionService } from '../transcription.service';

@Component({
  selector: 'app-course-transcription',
  imports: [RouterLink, FormsModule, DatePipe],
  templateUrl: './course-transcription.html',
  styleUrl: './course-transcription.scss',
})
export class CourseTranscription implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly coursesService = inject(CoursesService);
  private readonly transcriptionService = inject(TranscriptionService);

  private sessionsChannel: RealtimeChannel | null = null;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly courseTitle = signal<string | null>(null);
  readonly sessions = signal<TranscriptionSessionSummary[]>([]);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  readonly liveSession = computed(() => this.sessions().find((s) => s.status === 'live') ?? null);
  readonly pastSessions = computed(() => this.sessions().filter((s) => s.status !== 'live'));

  // --- Crear sesión, solo docente/administrador ---
  readonly newSessionFormOpen = signal(false);
  readonly creatingSession = signal(false);
  readonly newSessionError = signal<string | null>(null);
  protected readonly newSessionTitle = signal('');

  // --- Editar título de una sesión guardada, solo docente/administrador ---
  readonly editTitleFor = signal<TranscriptionSessionSummary | null>(null);
  readonly editingTitle = signal(false);
  readonly editTitleError = signal<string | null>(null);
  protected readonly editTitleInput = signal('');

  // --- Eliminar sesión, solo docente/administrador ---
  readonly pendingDeleteSession = signal<TranscriptionSessionSummary | null>(null);
  readonly deletingSession = signal(false);
  readonly deleteSessionError = signal<string | null>(null);

  readonly courseId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  constructor() {
    effect(() => {
      void this.load(this.courseId());
    });
  }

  openNewSessionForm(): void {
    const defaultTitle = `Clase del ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}`;
    this.newSessionTitle.set(defaultTitle);
    this.newSessionError.set(null);
    this.newSessionFormOpen.set(true);
  }

  cancelNewSessionForm(): void {
    if (this.creatingSession()) return;
    this.newSessionFormOpen.set(false);
  }

  async saveNewSessionForm(form: NgForm): Promise<void> {
    const courseId = this.courseId();
    if (form.invalid || !courseId || this.creatingSession()) return;

    this.creatingSession.set(true);
    this.newSessionError.set(null);

    try {
      const session = await this.transcriptionService.createSession(courseId, this.newSessionTitle().trim());
      this.newSessionFormOpen.set(false);
      await this.router.navigate(['/courses', courseId, 'transcripcion', session.id]);
    } catch {
      this.newSessionError.set('No se pudo crear la sesión. Intenta de nuevo.');
    } finally {
      this.creatingSession.set(false);
    }
  }

  openEditTitle(session: TranscriptionSessionSummary): void {
    this.editTitleInput.set(session.title);
    this.editTitleError.set(null);
    this.editTitleFor.set(session);
  }

  cancelEditTitle(): void {
    if (this.editingTitle()) return;
    this.editTitleFor.set(null);
  }

  async saveEditTitle(form: NgForm): Promise<void> {
    const target = this.editTitleFor();
    if (form.invalid || !target || this.editingTitle()) return;

    this.editingTitle.set(true);
    this.editTitleError.set(null);

    try {
      const title = this.editTitleInput().trim();
      await this.transcriptionService.updateSessionTitle(target.id, title);
      this.sessions.update((current) => current.map((s) => (s.id === target.id ? { ...s, title } : s)));
      this.editTitleFor.set(null);
    } catch {
      this.editTitleError.set('No se pudo guardar el título. Intenta de nuevo.');
    } finally {
      this.editingTitle.set(false);
    }
  }

  requestDeleteSession(session: TranscriptionSessionSummary): void {
    if (this.deletingSession()) return;
    this.deleteSessionError.set(null);
    this.pendingDeleteSession.set(session);
  }

  cancelDeleteSession(): void {
    if (this.deletingSession()) return;
    this.pendingDeleteSession.set(null);
  }

  async confirmDeleteSession(): Promise<void> {
    const session = this.pendingDeleteSession();
    if (!session || this.deletingSession()) return;

    this.deletingSession.set(true);
    this.deleteSessionError.set(null);

    try {
      await this.transcriptionService.deleteSession(session.id);
      this.sessions.update((current) => current.filter((s) => s.id !== session.id));
      this.pendingDeleteSession.set(null);
    } catch {
      this.deleteSessionError.set('No se pudo eliminar la sesión. Intenta de nuevo.');
    } finally {
      this.deletingSession.set(false);
    }
  }

  private async load(courseId: string | null): Promise<void> {
    this.cleanupChannel();
    this.sessions.set([]);

    if (!courseId) {
      this.loading.set(false);
      this.error.set('Curso no encontrado.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const userId = this.auth.session()?.user.id ?? null;
      const [course, sessions] = await Promise.all([
        this.coursesService.getCourse(courseId, userId),
        this.transcriptionService.listSessions(courseId),
      ]);
      this.courseTitle.set(course?.title ?? null);
      this.sessions.set(sessions);

      this.sessionsChannel = this.transcriptionService.subscribeToCourseSessions(courseId, () => {
        void this.refreshSessions(courseId);
      });
    } catch {
      this.error.set('No pudimos cargar las sesiones. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }

  // A diferencia de load(), no toca loading()/error() ni reinicia la lista a
  // vacío primero — es un refresco silencioso disparado por Realtime, no
  // debe parpadear la pantalla cada vez que alguien más crea o termina una
  // sesión.
  private async refreshSessions(courseId: string): Promise<void> {
    try {
      this.sessions.set(await this.transcriptionService.listSessions(courseId));
    } catch {
      // Silencioso: si falla, el usuario sigue viendo la última lista buena
      // y el próximo evento de Realtime (o un refresh manual) lo corrige.
    }
  }

  private cleanupChannel(): void {
    if (this.sessionsChannel) {
      void this.transcriptionService.unsubscribe(this.sessionsChannel);
      this.sessionsChannel = null;
    }
  }

  ngOnDestroy(): void {
    this.cleanupChannel();
  }
}
