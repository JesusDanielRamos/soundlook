import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProgressOverview, ProgressService, TimelineEntry } from './progress.service';

interface TimelineGroup {
  label: string;
  entries: TimelineEntry[];
}

@Component({
  selector: 'app-progress',
  imports: [RouterLink],
  templateUrl: './progress.html',
  styleUrl: './progress.scss',
})
export class Progress {
  private readonly auth = inject(AuthService);
  private readonly progressService = inject(ProgressService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly overview = signal<ProgressOverview | null>(null);

  readonly timelineGroups = computed<TimelineGroup[]>(() => {
    const timeline = this.overview()?.timeline ?? [];
    const groups: TimelineGroup[] = [];
    let currentKey = '';

    for (const entry of timeline) {
      const key = dateKey(entry.completedAt);
      if (key !== currentKey) {
        groups.push({ label: dateLabel(entry.completedAt), entries: [] });
        currentKey = key;
      }
      groups[groups.length - 1].entries.push(entry);
    }

    return groups;
  });

  constructor() {
    void this.loadOverview();
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  private async loadOverview(): Promise<void> {
    const userId = this.auth.session()?.user.id;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.overview.set(await this.progressService.loadOverview(userId));
    } catch {
      this.error.set('No pudimos cargar tu avance. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}

function dateKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey(iso) === dateKey(today.toISOString())) return 'Hoy';
  if (dateKey(iso) === dateKey(yesterday.toISOString())) return 'Ayer';

  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  });
}
