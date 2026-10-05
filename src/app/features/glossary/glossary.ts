import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { ContentStatus } from '../../core/models/content.model';
import { GLOSSARY_CATEGORIES, GlossaryService, GlossaryTerm } from './glossary.service';

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
  // Solo una tarjeta expandida a la vez (comportamiento de accordion).
  readonly expandedId = signal<string | null>(null);

  readonly searchQuery = signal('');
  readonly selectedCategory = signal('Todos');

  // Catálogo fijo + cualquier categoría "suelta" que ya exista en datos
  // viejos (por si algún término quedó con texto libre de antes de fijar
  // este catálogo) — así el filtro nunca esconde un término por accidente.
  readonly categories = computed(() => {
    const extra = new Set<string>();
    for (const term of this.terms()) {
      if (term.category && !GLOSSARY_CATEGORIES.includes(term.category)) {
        extra.add(term.category);
      }
    }
    return ['Todos', ...GLOSSARY_CATEGORIES, ...Array.from(extra).sort()];
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

  // --- Modal "Agregar/Editar término" (solo docente/administrador) ---
  readonly modalTarget = signal<'new' | string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  protected readonly glossaryCategories = GLOSSARY_CATEGORIES;

  protected readonly newTerm = signal('');
  protected readonly newDefinition = signal('');
  protected readonly newCategory = signal<string | null>(null);
  protected readonly newVideoUrl = signal('');
  protected readonly newStatus = signal<ContentStatus>('published');
  protected readonly newImageFile = signal<File | null>(null);
  protected readonly removeImage = signal(false);

  // El término que se está editando (null si el modal está en modo "nuevo"
  // o cerrado) — se usa para mostrar su imagen actual en el modal.
  readonly editingTerm = computed(() => {
    const target = this.modalTarget();
    if (!target || target === 'new') return null;
    return this.terms().find((t) => t.id === target) ?? null;
  });

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
    this.expandedId.update((current) => (current === id ? null : id));
  }

  isExpanded(id: string): boolean {
    return this.expandedId() === id;
  }

  openModal(): void {
    this.newTerm.set('');
    this.newDefinition.set('');
    this.newCategory.set(null);
    this.newVideoUrl.set('');
    this.newStatus.set('published');
    this.newImageFile.set(null);
    this.removeImage.set(false);
    this.formError.set(null);
    this.modalTarget.set('new');
  }

  startEdit(term: GlossaryTerm): void {
    this.newTerm.set(term.term);
    this.newDefinition.set(term.definition);
    this.newCategory.set(term.category);
    this.newVideoUrl.set(term.videoUrl ?? '');
    this.newStatus.set(term.status);
    this.newImageFile.set(null);
    this.removeImage.set(false);
    this.formError.set(null);
    this.modalTarget.set(term.id);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalTarget.set(null);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newImageFile.set(input.files?.[0] ?? null);
  }

  async onSubmit(form: NgForm): Promise<void> {
    const target = this.modalTarget();
    if (form.invalid || target === null || this.saving()) return;

    this.saving.set(true);
    this.formError.set(null);

    try {
      if (target === 'new') {
        const created = await this.glossaryService.createTerm({
          term: this.newTerm().trim(),
          definition: this.newDefinition().trim(),
          category: this.newCategory(),
          videoUrl: this.newVideoUrl().trim() || null,
          status: this.newStatus(),
          imageFile: this.newImageFile(),
        });

        this.terms.update((current) => [...current, created].sort((a, b) => a.term.localeCompare(b.term)));
      } else {
        const updated = await this.glossaryService.updateTerm(target, {
          term: this.newTerm().trim(),
          definition: this.newDefinition().trim(),
          category: this.newCategory(),
          videoUrl: this.newVideoUrl().trim() || null,
          status: this.newStatus(),
          imageFile: this.newImageFile(),
          removeImage: this.removeImage(),
        });

        this.terms.update((current) =>
          current.map((t) => (t.id === target ? updated : t)).sort((a, b) => a.term.localeCompare(b.term)),
        );
      }

      this.modalTarget.set(null);
    } catch {
      this.formError.set('No se pudo guardar el término. Intenta de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  // --- Confirmación de borrado (modal propio en vez de confirm() nativo) ---
  readonly pendingDeleteTerm = signal<GlossaryTerm | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  requestDelete(term: GlossaryTerm): void {
    if (this.saving()) return;
    this.deleteError.set(null);
    this.pendingDeleteTerm.set(term);
  }

  cancelDelete(): void {
    if (this.deleting()) return;
    this.pendingDeleteTerm.set(null);
  }

  async confirmDelete(): Promise<void> {
    const term = this.pendingDeleteTerm();
    if (!term || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    try {
      await this.glossaryService.deleteTerm(term.id);
      this.terms.update((current) => current.filter((t) => t.id !== term.id));
      if (this.expandedId() === term.id) this.expandedId.set(null);
      this.pendingDeleteTerm.set(null);
    } catch {
      this.deleteError.set('No se pudo eliminar el término. Intenta de nuevo.');
    } finally {
      this.deleting.set(false);
    }
  }
}
