import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DecibelMeter } from '../../../shared/decibel-meter/decibel-meter';
import { CoursesService, UnitDetail as UnitDetailModel, UnitLesson } from '../courses.service';

@Component({
  selector: 'app-unit-detail',
  imports: [RouterLink, FormsModule, DecibelMeter],
  templateUrl: './unit-detail.html',
  styleUrl: './unit-detail.scss',
})
export class UnitDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly coursesService = inject(CoursesService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly unit = signal<UnitDetailModel | null>(null);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  readonly percent = computed(() => {
    const unit = this.unit();
    if (!unit || unit.totalCount === 0) return 0;
    return Math.round((unit.completedCount / unit.totalCount) * 100);
  });

  // --- Edición del ejemplo interactivo (título + descripción), solo
  // docente/administrador ---
  readonly interactiveFormOpen = signal(false);
  readonly interactiveSaving = signal(false);
  readonly interactiveFormError = signal<string | null>(null);

  protected readonly interactiveTitle = signal('');
  protected readonly interactiveDescription = signal('');

  // --- Eliminar ejemplo interactivo, solo docente/administrador ---
  readonly deleteInteractiveConfirmOpen = signal(false);
  readonly deletingInteractive = signal(false);
  readonly deleteInteractiveError = signal<string | null>(null);

  // --- Agregar quiz de la unidad, solo docente/administrador ---
  readonly quizFormOpen = signal(false);
  readonly quizSaving = signal(false);
  readonly quizFormError = signal<string | null>(null);
  protected readonly newQuizTitle = signal('');

  // --- Eliminar quiz, solo docente/administrador ---
  readonly deleteQuizConfirmOpen = signal(false);
  readonly deletingQuiz = signal(false);
  readonly deleteQuizError = signal<string | null>(null);

  // --- Agregar/renombrar lección, solo docente/administrador ---
  readonly lessonFormOpenFor = signal<'new' | string | null>(null);
  readonly lessonSaving = signal(false);
  readonly lessonFormError = signal<string | null>(null);
  protected readonly lessonTitleInput = signal('');

  // --- Eliminar lección, solo docente/administrador ---
  readonly pendingDeleteLesson = signal<UnitLesson | null>(null);
  readonly deletingLesson = signal(false);
  readonly deleteLessonError = signal<string | null>(null);

  // Angular reutiliza esta misma instancia del componente al navegar entre
  // /courses/:id/units/:unitId — hay que escuchar paramMap en vez de leer
  // el snapshot una sola vez, o la página no se actualiza al cambiar de unidad.
  private readonly unitId = toSignal(this.route.paramMap.pipe(map((params) => params.get('unitId'))), {
    initialValue: this.route.snapshot.paramMap.get('unitId'),
  });

  constructor() {
    effect(() => {
      void this.loadUnit(this.unitId());
    });
  }

  openInteractiveEdit(): void {
    const unit = this.unit();
    if (!unit) return;

    this.interactiveTitle.set(unit.interactiveTitle ?? '');
    this.interactiveDescription.set(unit.interactiveDescription ?? '');
    this.interactiveFormError.set(null);
    this.interactiveFormOpen.set(true);
  }

  cancelInteractiveEdit(): void {
    if (this.interactiveSaving()) return;
    this.interactiveFormOpen.set(false);
  }

  async saveInteractiveForm(form: NgForm): Promise<void> {
    const unit = this.unit();
    if (form.invalid || !unit || this.interactiveSaving()) return;

    this.interactiveSaving.set(true);
    this.interactiveFormError.set(null);

    try {
      const title = this.interactiveTitle().trim();
      const description = this.interactiveDescription().trim() || null;

      await this.coursesService.updateUnitInteractive(unit.id, { title, description });
      this.unit.update((current) =>
        current ? { ...current, interactiveTitle: title, interactiveDescription: description } : current,
      );
      this.interactiveFormOpen.set(false);
    } catch {
      this.interactiveFormError.set('No se pudo guardar el ejemplo interactivo. Intenta de nuevo.');
    } finally {
      this.interactiveSaving.set(false);
    }
  }

  requestDeleteInteractive(): void {
    if (this.deletingInteractive()) return;
    this.deleteInteractiveError.set(null);
    this.deleteInteractiveConfirmOpen.set(true);
  }

  cancelDeleteInteractive(): void {
    if (this.deletingInteractive()) return;
    this.deleteInteractiveConfirmOpen.set(false);
  }

  async confirmDeleteInteractive(): Promise<void> {
    const unit = this.unit();
    if (!unit || this.deletingInteractive()) return;

    this.deletingInteractive.set(true);
    this.deleteInteractiveError.set(null);

    try {
      await this.coursesService.deleteUnitInteractive(unit.id);
      this.unit.update((current) =>
        current ? { ...current, interactiveTitle: null, interactiveDescription: null } : current,
      );
      this.deleteInteractiveConfirmOpen.set(false);
    } catch {
      this.deleteInteractiveError.set('No se pudo eliminar el ejemplo interactivo. Intenta de nuevo.');
    } finally {
      this.deletingInteractive.set(false);
    }
  }

  openQuizForm(): void {
    this.newQuizTitle.set('');
    this.quizFormError.set(null);
    this.quizFormOpen.set(true);
  }

  cancelQuizForm(): void {
    if (this.quizSaving()) return;
    this.quizFormOpen.set(false);
  }

  async saveQuizForm(form: NgForm): Promise<void> {
    const unit = this.unit();
    if (form.invalid || !unit || this.quizSaving()) return;

    this.quizSaving.set(true);
    this.quizFormError.set(null);

    try {
      const quiz = await this.coursesService.createUnitQuiz(unit.id, this.newQuizTitle().trim());
      this.unit.update((current) => (current ? { ...current, quiz } : current));
      this.quizFormOpen.set(false);
    } catch {
      this.quizFormError.set('No se pudo crear el quiz. Intenta de nuevo.');
    } finally {
      this.quizSaving.set(false);
    }
  }

  requestDeleteQuiz(): void {
    if (this.deletingQuiz()) return;
    this.deleteQuizError.set(null);
    this.deleteQuizConfirmOpen.set(true);
  }

  cancelDeleteQuiz(): void {
    if (this.deletingQuiz()) return;
    this.deleteQuizConfirmOpen.set(false);
  }

  async confirmDeleteQuiz(): Promise<void> {
    const unit = this.unit();
    if (!unit?.quiz || this.deletingQuiz()) return;

    this.deletingQuiz.set(true);
    this.deleteQuizError.set(null);

    try {
      await this.coursesService.deleteUnitQuiz(unit.quiz.id);
      this.unit.update((current) => (current ? { ...current, quiz: null } : current));
      this.deleteQuizConfirmOpen.set(false);
    } catch {
      this.deleteQuizError.set('No se pudo eliminar el quiz. Intenta de nuevo.');
    } finally {
      this.deletingQuiz.set(false);
    }
  }

  openNewLessonForm(): void {
    this.lessonTitleInput.set('');
    this.lessonFormError.set(null);
    this.lessonFormOpenFor.set('new');
  }

  openEditLessonForm(lesson: UnitLesson): void {
    this.lessonTitleInput.set(lesson.title);
    this.lessonFormError.set(null);
    this.lessonFormOpenFor.set(lesson.id);
  }

  cancelLessonForm(): void {
    if (this.lessonSaving()) return;
    this.lessonFormOpenFor.set(null);
  }

  async saveLessonForm(form: NgForm): Promise<void> {
    const unit = this.unit();
    const target = this.lessonFormOpenFor();
    if (form.invalid || !unit || target === null || this.lessonSaving()) return;

    this.lessonSaving.set(true);
    this.lessonFormError.set(null);

    try {
      const title = this.lessonTitleInput().trim();

      if (target === 'new') {
        const nextOrder = unit.lessons.reduce((max, l) => Math.max(max, l.order), 0) + 1;
        await this.coursesService.createLesson(unit.id, nextOrder, title);
      } else {
        await this.coursesService.updateLessonTitle(target, title);
      }

      await this.loadUnit(unit.id);
      this.lessonFormOpenFor.set(null);
    } catch {
      this.lessonFormError.set('No se pudo guardar la lección. Intenta de nuevo.');
    } finally {
      this.lessonSaving.set(false);
    }
  }

  requestDeleteLesson(lesson: UnitLesson): void {
    if (this.deletingLesson()) return;
    this.deleteLessonError.set(null);
    this.pendingDeleteLesson.set(lesson);
  }

  cancelDeleteLesson(): void {
    if (this.deletingLesson()) return;
    this.pendingDeleteLesson.set(null);
  }

  async confirmDeleteLesson(): Promise<void> {
    const lesson = this.pendingDeleteLesson();
    const unit = this.unit();
    if (!lesson || !unit || this.deletingLesson()) return;

    this.deletingLesson.set(true);
    this.deleteLessonError.set(null);

    try {
      await this.coursesService.deleteLesson(lesson.id);
      await this.loadUnit(unit.id);
      this.pendingDeleteLesson.set(null);
    } catch {
      this.deleteLessonError.set('No se pudo eliminar la lección. Intenta de nuevo.');
    } finally {
      this.deletingLesson.set(false);
    }
  }

  private async loadUnit(unitId: string | null): Promise<void> {
    this.unit.set(null);

    if (!unitId) {
      this.loading.set(false);
      this.error.set('Unidad no encontrada.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const userId = this.auth.session()?.user.id ?? null;
      this.unit.set(await this.coursesService.getUnit(unitId, userId));
    } catch {
      this.error.set('No pudimos cargar esta unidad. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}
