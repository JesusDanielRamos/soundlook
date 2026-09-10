import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { ContentStatus } from '../../core/models/content.model';
import { GlossaryService, GlossaryTerm } from './glossary.service';

@Component({
  selector: 'app-glossary',
  imports: [FormsModule],
  templateUrl: './glossary.html',
  styleUrl: './glossary.scss',
})
export class Glossary {
  private readonly auth = inject(AuthService);
  private readonly glossaryService = inject(GlossaryService);

  readonly canManage = computed(() => {
    const role = this.auth.profile()?.role;
    return role === 'docente' || role === 'administrador';
  });

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly terms = signal<GlossaryTerm[]>([]);
  readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  readonly searchQuery = signal('');
  readonly selectedCategory = signal('Todos');

  readonly categories = computed(() => {
    const found = new Set<string>();
    for (const term of this.terms()) {
      if (term.category) found.add(term.category);
    }
    return ['Todos', ...Array.from(found).sort()];
  });

  readonly filteredTerms = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const category = this.selectedCategory();

    return this.terms().filter((term) => {
      const matchesCategory = category === 'Todos' || term.category === category;
      const matchesQuery =
        !query ||
        term.term.toLowerCase().includes(query) ||
        term.definition.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  });

  // --- Modal "Agregar término" (solo docente/administrador) ---
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  protected readonly newTerm = signal('');
  protected readonly newDefinition = signal('');
  protected readonly newCategory = signal('');
  protected readonly newVideoUrl = signal('');
  protected readonly newStatus = signal<ContentStatus>('published');
  protected readonly newImageFile = signal<File | null>(null);

  constructor() {
    void this.loadTerms();
  }

  private async loadTerms(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.terms.set(await this.glossaryService.listTerms());
    } catch {
      this.error.set('No pudimos cargar el glosario. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }

  toggleExpand(id: string): void {
    this.expandedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  openModal(): void {
    this.newTerm.set('');
    this.newDefinition.set('');
    this.newCategory.set('');
    this.newVideoUrl.set('');
    this.newStatus.set('published');
    this.newImageFile.set(null);
    this.formError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newImageFile.set(input.files?.[0] ?? null);
  }

  async onSubmit(form: NgForm): Promise<void> {
    if (form.invalid || this.saving()) return;

    this.saving.set(true);
    this.formError.set(null);

    try {
      const created = await this.glossaryService.createTerm({
        term: this.newTerm().trim(),
        definition: this.newDefinition().trim(),
        category: this.newCategory().trim() || null,
        videoUrl: this.newVideoUrl().trim() || null,
        status: this.newStatus(),
        imageFile: this.newImageFile(),
      });

      this.terms.update((current) =>
        [...current, created].sort((a, b) => a.term.localeCompare(b.term)),
      );
      this.modalOpen.set(false);
    } catch {
      this.formError.set('No se pudo guardar el término. Intenta de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }
}
