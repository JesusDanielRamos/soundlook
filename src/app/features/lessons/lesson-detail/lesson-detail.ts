import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonDetail as LessonDetailModel, LessonSection, LessonsService } from '../lessons.service';
import { toVideoEmbed } from '../video-embed';

@Component({
  selector: 'app-lesson-detail',
  imports: [RouterLink, FormsModule],
  templateUrl: './lesson-detail.html',
  styleUrl: './lesson-detail.scss',
})
export class LessonDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly lessonsService = inject(LessonsService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly lesson = signal<LessonDetailModel | null>(null);
  readonly expandedSectionIds = signal<ReadonlySet<string>>(new Set());

  readonly marking = signal(false);
  readonly markError = signal<string | null>(null);

  // --- Edición de secciones (accordions), solo docente/administrador ---
  readonly sectionFormOpenFor = signal<'new' | string | null>(null);
  readonly sectionSaving = signal(false);
  readonly sectionFormError = signal<string | null>(null);

  protected readonly sectionTitle = signal('');
  protected readonly sectionContent = signal('');
  protected readonly sectionImageFile = signal<File | null>(null);
  protected readonly removeSectionImage = signal(false);

  // La sección que se está editando (null si el modal está en modo "nueva"
  // o cerrado) — se usa para mostrar su imagen actual en el modal.
  readonly editingSection = computed(() => {
    const target = this.sectionFormOpenFor();
    if (!target || target === 'new') return null;
    return this.lesson()?.sections.find((s) => s.id === target) ?? null;
  });

  readonly videoEmbed = computed(() => {
    const url = this.lesson()?.videoUrl;
    if (!url) return null;

    const embed = toVideoEmbed(url);
    return embed.kind === 'iframe'
      ? { kind: 'iframe' as const, safeSrc: this.sanitizer.bypassSecurityTrustResourceUrl(embed.src) }
      : { kind: 'video' as const, src: embed.src };
  });

  // Angular reutiliza esta misma instancia del componente al navegar entre
  // /lessons/:id — el snapshot de la ruta no cambia solo, hay que escuchar
  // paramMap para recargar cuando el id de la URL cambia (ej. al usar
  // Anterior/Siguiente).
  private readonly lessonId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  constructor() {
    effect(() => {
      void this.loadLesson(this.lessonId());
    });
  }

  toggleSection(id: string): void {
    this.expandedSectionIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isSectionExpanded(id: string): boolean {
    return this.expandedSectionIds().has(id);
  }

  async markCompleted(): Promise<void> {
    const lesson = this.lesson();
    const userId = this.auth.session()?.user.id;
    if (!lesson || !userId || lesson.completed || this.marking()) return;

    this.marking.set(true);
    this.markError.set(null);

    try {
      await this.lessonsService.markCompleted(lesson.id, userId);
      this.lesson.update((current) => (current ? { ...current, completed: true } : current));
    } catch {
      this.markError.set('No pudimos guardar tu progreso. Intenta de nuevo.');
    } finally {
      this.marking.set(false);
    }
  }

  startEditSection(section: LessonSection): void {
    this.sectionTitle.set(section.title);
    this.sectionContent.set(section.content);
    this.sectionImageFile.set(null);
    this.removeSectionImage.set(false);
    this.sectionFormError.set(null);
    this.sectionFormOpenFor.set(section.id);
  }

  startNewSection(): void {
    this.sectionTitle.set('');
    this.sectionContent.set('');
    this.sectionImageFile.set(null);
    this.removeSectionImage.set(false);
    this.sectionFormError.set(null);
    this.sectionFormOpenFor.set('new');
  }

  cancelSectionForm(): void {
    if (this.sectionSaving()) return;
    this.sectionFormOpenFor.set(null);
  }

  onSectionImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sectionImageFile.set(input.files?.[0] ?? null);
  }

  async saveSectionForm(form: NgForm): Promise<void> {
    const lesson = this.lesson();
    const target = this.sectionFormOpenFor();
    if (form.invalid || !lesson || target === null || this.sectionSaving()) return;

    this.sectionSaving.set(true);
    this.sectionFormError.set(null);

    try {
      if (target === 'new') {
        const nextOrder = lesson.sections.reduce((max, s) => Math.max(max, s.order), 0) + 1;
        const created = await this.lessonsService.createSection(lesson.id, nextOrder, {
          title: this.sectionTitle().trim(),
          content: this.sectionContent().trim(),
          imageFile: this.sectionImageFile(),
        });
        this.lesson.update((current) =>
          current ? { ...current, sections: [...current.sections, created] } : current,
        );
      } else {
        const updated = await this.lessonsService.updateSection(target, {
          title: this.sectionTitle().trim(),
          content: this.sectionContent().trim(),
          imageFile: this.sectionImageFile(),
          removeImage: this.removeSectionImage(),
        });
        this.lesson.update((current) =>
          current
            ? { ...current, sections: current.sections.map((s) => (s.id === target ? updated : s)) }
            : current,
        );
      }

      this.sectionFormOpenFor.set(null);
    } catch {
      this.sectionFormError.set('No se pudo guardar la sección. Intenta de nuevo.');
    } finally {
      this.sectionSaving.set(false);
    }
  }

  async deleteSection(section: LessonSection): Promise<void> {
    if (this.sectionSaving()) return;
    if (!confirm(`¿Eliminar la sección "${section.title}"? Esta acción no se puede deshacer.`)) return;

    this.sectionSaving.set(true);
    this.sectionFormError.set(null);

    try {
      await this.lessonsService.deleteSection(section.id);
      this.lesson.update((current) =>
        current ? { ...current, sections: current.sections.filter((s) => s.id !== section.id) } : current,
      );
    } catch {
      this.sectionFormError.set('No se pudo eliminar la sección. Intenta de nuevo.');
    } finally {
      this.sectionSaving.set(false);
    }
  }

  private async loadLesson(id: string | null): Promise<void> {
    // Estado de UI de la lección anterior (accordions abiertos, modal de
    // sección, error de "marcar completada") no debe sobrevivir el cambio.
    this.expandedSectionIds.set(new Set());
    this.sectionFormOpenFor.set(null);
    this.markError.set(null);
    this.lesson.set(null);

    if (!id) {
      this.loading.set(false);
      this.error.set('Lección no encontrada.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const userId = this.auth.session()?.user.id ?? null;
      const lesson = await this.lessonsService.getLesson(id, userId);
      this.lesson.set(lesson);

      if (lesson && lesson.sections.length > 0) {
        this.expandedSectionIds.set(new Set([lesson.sections[0].id]));
      }
    } catch {
      this.error.set('No pudimos cargar esta lección. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}
