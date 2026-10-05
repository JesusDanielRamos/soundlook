import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CourseWithUnits, CoursesService } from '../courses.service';

@Component({
  selector: 'app-course-detail',
  imports: [RouterLink],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
})
export class CourseDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly coursesService = inject(CoursesService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly course = signal<CourseWithUnits | null>(null);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  readonly continueLabel = computed(() =>
    this.course()?.courseCompleted ? 'Repasar curso →' : 'Continuar curso →',
  );

  // --- Modal "Editar portada", solo docente/administrador ---
  readonly imageModalOpen = signal(false);
  readonly imageSaving = signal(false);
  readonly imageError = signal<string | null>(null);
  protected readonly newImageFile = signal<File | null>(null);
  protected readonly removeImage = signal(false);

  // Angular reutiliza esta misma instancia del componente al navegar entre
  // /courses/:id — hay que escuchar paramMap en vez de leer el snapshot una
  // sola vez, o la página no se actualiza al cambiar de curso.
  private readonly courseId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  constructor() {
    effect(() => {
      void this.loadCourse(this.courseId());
    });
  }

  openImageModal(): void {
    this.newImageFile.set(null);
    this.removeImage.set(false);
    this.imageError.set(null);
    this.imageModalOpen.set(true);
  }

  closeImageModal(): void {
    if (this.imageSaving()) return;
    this.imageModalOpen.set(false);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newImageFile.set(input.files?.[0] ?? null);
  }

  async saveImage(): Promise<void> {
    const course = this.course();
    if (!course || this.imageSaving()) return;

    this.imageSaving.set(true);
    this.imageError.set(null);

    try {
      const imageUrl = await this.coursesService.updateCourseImage(
        course.id,
        this.newImageFile(),
        this.removeImage(),
      );
      this.course.update((current) => (current ? { ...current, imageUrl } : current));
      this.imageModalOpen.set(false);
    } catch {
      this.imageError.set('No se pudo actualizar la portada. Intenta de nuevo.');
    } finally {
      this.imageSaving.set(false);
    }
  }

  private async loadCourse(id: string | null): Promise<void> {
    this.course.set(null);

    if (!id) {
      this.loading.set(false);
      this.error.set('Curso no encontrado.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const userId = this.auth.session()?.user.id ?? null;
      this.course.set(await this.coursesService.getCourse(id, userId));
    } catch {
      this.error.set('No pudimos cargar este curso. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}
