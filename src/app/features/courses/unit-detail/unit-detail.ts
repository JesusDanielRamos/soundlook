import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CoursesService, UnitDetail as UnitDetailModel } from '../courses.service';

@Component({
  selector: 'app-unit-detail',
  imports: [RouterLink],
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

  readonly percent = computed(() => {
    const unit = this.unit();
    if (!unit || unit.totalCount === 0) return 0;
    return Math.round((unit.completedCount / unit.totalCount) * 100);
  });

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
