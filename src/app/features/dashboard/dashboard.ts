import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CourseProgress, DashboardService, RecentLesson } from './dashboard.service';

interface RecentLessonView extends RecentLesson {
  relativeTime: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);

  readonly firstName = computed(() => {
    const fullName = this.auth.profile()?.fullName;
    return fullName?.trim().split(/\s+/)[0] ?? 'de vuelta';
  });

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly courses = signal<CourseProgress[]>([]);
  readonly recentLessons = signal<RecentLessonView[]>([]);

  readonly totalLessons = computed(() =>
    this.courses().reduce((sum, course) => sum + course.lessonsCount, 0),
  );
  readonly totalCompleted = computed(() =>
    this.courses().reduce((sum, course) => sum + course.completedCount, 0),
  );
  readonly overallPercent = computed(() =>
    this.totalLessons() === 0 ? 0 : Math.round((this.totalCompleted() / this.totalLessons()) * 100),
  );

  constructor() {
    void this.loadDashboard();
  }

  private async loadDashboard(): Promise<void> {
    const userId = this.auth.session()?.user.id;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const [courses, recentLessons] = await Promise.all([
        this.dashboardService.loadCourseProgress(userId),
        this.dashboardService.loadRecentLessons(userId),
      ]);

      this.courses.set(courses);
      this.recentLessons.set(
        recentLessons.map((lesson) => ({ ...lesson, relativeTime: formatRelativeTime(lesson.viewedAt) })),
      );
    } catch {
      this.error.set('No pudimos cargar tu avance. Intenta de nuevo más tarde.');
    } finally {
      this.loading.set(false);
    }
  }
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return 'ahora mismo';
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 4) return `hace ${diffWeeks} sem`;

  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}
