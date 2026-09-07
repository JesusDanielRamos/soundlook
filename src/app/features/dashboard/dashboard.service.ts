import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

export interface CourseProgress {
  id: string;
  title: string;
  description: string | null;
  unitsCount: number;
  lessonsCount: number;
  completedCount: number;
  percent: number;
}

export interface RecentLesson {
  id: string;
  title: string;
  unitOrder: number;
  viewedAt: string;
}

// Formas mínimas de la respuesta anidada de Supabase — solo los campos que
// pedimos en el select, no el tipo completo de las tablas.
interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  units: { id: string; lessons: { id: string }[] }[];
}

interface RecentLessonRow {
  updated_at: string;
  lesson: { id: string; title: string; unit: { order: number } | null } | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SupabaseClientService).client;

  // RLS ya limita courses/units/lessons a lo publicado para el rol
  // 'estudiante', así que no hace falta filtrar status aquí.
  async loadCourseProgress(userId: string): Promise<CourseProgress[]> {
    const [coursesResult, progressResult] = await Promise.all([
      this.supabase.from('courses').select(`
        id, title, description,
        units ( id, lessons ( id ) )
      `),
      this.supabase.from('lesson_progress').select('lesson_id').eq('user_id', userId).eq('status', 'completed'),
    ]);

    if (coursesResult.error) throw coursesResult.error;
    if (progressResult.error) throw progressResult.error;

    const completedLessonIds = new Set(
      (progressResult.data ?? []).map((row) => row['lesson_id'] as string),
    );

    return (coursesResult.data as CourseRow[]).map((course) => {
      const lessonIds = course.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.id));
      const completedCount = lessonIds.filter((id) => completedLessonIds.has(id)).length;

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        unitsCount: course.units.length,
        lessonsCount: lessonIds.length,
        completedCount,
        percent: lessonIds.length === 0 ? 0 : Math.round((completedCount / lessonIds.length) * 100),
      };
    });
  }

  async loadRecentLessons(userId: string, limit = 3): Promise<RecentLesson[]> {
    const { data, error } = await this.supabase
      .from('lesson_progress')
      .select('updated_at, lesson:lessons ( id, title, unit:units ( order ) )')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data as unknown as RecentLessonRow[])
      .filter((row) => row.lesson !== null)
      .map((row) => ({
        id: row.lesson!.id,
        title: row.lesson!.title,
        unitOrder: row.lesson!.unit?.order ?? 0,
        viewedAt: row.updated_at,
      }));
  }
}
