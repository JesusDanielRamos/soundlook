import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

export interface ProgressUnit {
  id: string;
  title: string;
  order: number;
  completedCount: number;
  totalCount: number;
  percent: number;
}

export interface ProgressCourse {
  id: string;
  title: string;
  completedCount: number;
  totalCount: number;
  percent: number;
  units: ProgressUnit[];
}

export interface TimelineEntry {
  lessonId: string;
  lessonTitle: string;
  unitTitle: string;
  courseTitle: string;
  completedAt: string;
}

export interface ProgressOverview {
  totalLessons: number;
  completedLessons: number;
  percent: number;
  totalMinutes: number;
  courses: ProgressCourse[];
  timeline: TimelineEntry[];
}

// Formas mínimas de la respuesta anidada de Supabase — solo los campos que
// pedimos en el select, no el tipo completo de las tablas.
interface CourseStructureRow {
  id: string;
  title: string;
  units: {
    id: string;
    title: string;
    order: number;
    lessons: { id: string }[];
  }[];
}

interface CompletedProgressRow {
  lesson_id: string;
  completed_at: string | null;
  lesson: {
    id: string;
    title: string;
    estimated_minutes: number | null;
    unit: { id: string; title: string; order: number; course: { id: string; title: string } | null } | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly supabase = inject(SupabaseClientService).client;

  async loadOverview(userId: string): Promise<ProgressOverview> {
    const [structureResult, progressResult] = await Promise.all([
      this.supabase
        .from('courses')
        .select('id, title, units ( id, title, order, lessons ( id ) )')
        .order('created_at', { ascending: true }),
      this.supabase
        .from('lesson_progress')
        .select(
          `lesson_id, completed_at,
           lesson:lessons ( id, title, estimated_minutes, unit:units ( id, title, order, course:courses ( id, title ) ) )`,
        )
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false }),
    ]);

    if (structureResult.error) throw structureResult.error;
    if (progressResult.error) throw progressResult.error;

    const courseRows = structureResult.data as CourseStructureRow[];
    const progressRows = progressResult.data as unknown as CompletedProgressRow[];

    const completedLessonIds = new Set(progressRows.map((row) => row.lesson_id));

    let totalLessons = 0;
    let completedLessons = 0;

    const courses: ProgressCourse[] = courseRows.map((course) => {
      const units: ProgressUnit[] = [...course.units]
        .sort((a, b) => a.order - b.order)
        .map((unit) => {
          const unitTotal = unit.lessons.length;
          const unitCompleted = unit.lessons.filter((l) => completedLessonIds.has(l.id)).length;
          totalLessons += unitTotal;
          completedLessons += unitCompleted;

          return {
            id: unit.id,
            title: unit.title,
            order: unit.order,
            completedCount: unitCompleted,
            totalCount: unitTotal,
            percent: unitTotal === 0 ? 0 : Math.round((unitCompleted / unitTotal) * 100),
          };
        });

      const courseTotal = units.reduce((sum, u) => sum + u.totalCount, 0);
      const courseCompleted = units.reduce((sum, u) => sum + u.completedCount, 0);

      return {
        id: course.id,
        title: course.title,
        completedCount: courseCompleted,
        totalCount: courseTotal,
        percent: courseTotal === 0 ? 0 : Math.round((courseCompleted / courseTotal) * 100),
        units,
      };
    });

    const totalMinutes = progressRows.reduce((sum, row) => sum + (row.lesson?.estimated_minutes ?? 0), 0);

    const timeline: TimelineEntry[] = progressRows
      .filter((row): row is CompletedProgressRow & { completed_at: string; lesson: NonNullable<CompletedProgressRow['lesson']> } =>
        row.completed_at !== null && row.lesson !== null,
      )
      .map((row) => ({
        lessonId: row.lesson.id,
        lessonTitle: row.lesson.title,
        unitTitle: row.lesson.unit?.title ?? '',
        courseTitle: row.lesson.unit?.course?.title ?? '',
        completedAt: row.completed_at,
      }));

    return {
      totalLessons,
      completedLessons,
      percent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      totalMinutes,
      courses,
      timeline,
    };
  }
}
