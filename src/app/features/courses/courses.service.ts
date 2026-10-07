import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

const COURSE_MEDIA_BUCKET = 'course-media';

export interface CourseListItem {
  id: string;
  title: string;
  description: string | null;
  unitsCount: number;
  lessonsCount: number;
  imageUrl: string | null;
}

export type UnitStatus = 'completed' | 'in_progress' | 'pending';

export interface CourseLesson {
  id: string;
  title: string;
  order: number;
  completed: boolean;
}

export interface CourseUnit {
  id: string;
  title: string;
  description: string | null;
  order: number;
  lessons: CourseLesson[];
  status: UnitStatus;
}

export type LessonState = 'completed' | 'current' | 'pending';

export interface UnitLesson {
  id: string;
  title: string;
  order: number;
  estimatedMinutes: number | null;
  completed: boolean;
  state: LessonState;
}

export interface UnitDetail {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string | null;
  order: number;
  status: UnitStatus;
  lessons: UnitLesson[];
  completedCount: number;
  totalCount: number;
  totalMinutes: number | null;
  interactiveTitle: string | null;
  interactiveDescription: string | null;
  quiz: { id: string; title: string } | null;
}

export interface UnitInteractiveInput {
  title: string;
  description: string | null;
}

export interface CourseWithUnits {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  units: CourseUnit[];
  totalLessons: number;
  completedLessons: number;
  percent: number;
  // Primera lección pendiente (para el botón "Continuar curso"). Si ya
  // terminó todo el curso, apunta a la última lección ("Repasar curso").
  continueLessonId: string | null;
  courseCompleted: boolean;
}

// Formas mínimas de la respuesta anidada de Supabase — solo los campos que
// pedimos en el select, no el tipo completo de las tablas.
interface CourseListRow {
  id: string;
  title: string;
  description: string | null;
  image_path: string | null;
  units: { id: string; lessons: { id: string }[] }[];
}

interface CourseDetailRow {
  id: string;
  title: string;
  description: string | null;
  image_path: string | null;
  units: {
    id: string;
    title: string;
    description: string | null;
    order: number;
    lessons: { id: string; title: string; order: number }[];
  }[];
}

interface UnitDetailRow {
  id: string;
  title: string;
  description: string | null;
  order: number;
  course_id: string;
  interactive_title: string | null;
  interactive_description: string | null;
  course: { title: string } | null;
  lessons: { id: string; title: string; order: number; estimated_minutes: number | null }[];
}

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly supabase = inject(SupabaseClientService).client;

  // RLS ya limita courses/units/lessons a lo publicado para el rol
  // 'estudiante', así que no hace falta filtrar status aquí.
  async listCourses(): Promise<CourseListItem[]> {
    const { data, error } = await this.supabase
      .from('courses')
      .select('id, title, description, image_path, units ( id, lessons ( id ) )')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data as CourseListRow[]).map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      imageUrl: this.resolveMediaUrl(course.image_path),
      unitsCount: course.units.length,
      lessonsCount: course.units.reduce((sum, unit) => sum + unit.lessons.length, 0),
    }));
  }

  async getCourse(id: string, userId: string | null): Promise<CourseWithUnits | null> {
    const { data, error } = await this.supabase
      .from('courses')
      .select(
        `id, title, description, image_path,
         units ( id, title, description, order, lessons ( id, title, order ) )`,
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const course = data as CourseDetailRow;
    const sortedUnits = [...course.units]
      .sort((a, b) => a.order - b.order)
      .map((unit) => ({ ...unit, lessons: [...unit.lessons].sort((a, b) => a.order - b.order) }));

    const completedLessonIds = userId
      ? await this.loadCompletedLessonIds(userId, sortedUnits.flatMap((u) => u.lessons.map((l) => l.id)))
      : new Set<string>();

    let totalLessons = 0;
    let completedLessons = 0;
    let continueLessonId: string | null = null;
    let lastLessonId: string | null = null;

    const units: CourseUnit[] = sortedUnits.map((unit) => {
      const lessons: CourseLesson[] = unit.lessons.map((lesson) => {
        const completed = completedLessonIds.has(lesson.id);
        totalLessons += 1;
        if (completed) completedLessons += 1;
        lastLessonId = lesson.id;
        if (!completed && continueLessonId === null) continueLessonId = lesson.id;
        return { id: lesson.id, title: lesson.title, order: lesson.order, completed };
      });

      const status: UnitStatus =
        lessons.length === 0
          ? 'pending'
          : lessons.every((l) => l.completed)
            ? 'completed'
            : lessons.some((l) => l.completed)
              ? 'in_progress'
              : 'pending';

      return {
        id: unit.id,
        title: unit.title,
        description: unit.description,
        order: unit.order,
        lessons,
        status,
      };
    });

    const courseCompleted = totalLessons > 0 && completedLessons === totalLessons;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      imageUrl: this.resolveMediaUrl(course.image_path),
      units,
      totalLessons,
      completedLessons,
      percent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      continueLessonId: courseCompleted ? lastLessonId : continueLessonId,
      courseCompleted,
    };
  }

  async getUnit(unitId: string, userId: string | null): Promise<UnitDetail | null> {
    const { data, error } = await this.supabase
      .from('units')
      .select(
        `id, title, description, order, course_id, interactive_title, interactive_description,
         course:courses ( title ),
         lessons ( id, title, order, estimated_minutes )`,
      )
      .eq('id', unitId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as UnitDetailRow;
    const sortedLessons = [...row.lessons].sort((a, b) => a.order - b.order);

    const [completedLessonIds, quiz] = await Promise.all([
      userId ? this.loadCompletedLessonIds(userId, sortedLessons.map((l) => l.id)) : Promise.resolve(new Set<string>()),
      this.loadUnitQuiz(unitId),
    ]);

    let currentAssigned = false;
    let completedCount = 0;
    let totalMinutes: number | null = null;

    const lessons: UnitLesson[] = sortedLessons.map((lesson) => {
      const completed = completedLessonIds.has(lesson.id);
      if (completed) completedCount += 1;
      if (lesson.estimated_minutes !== null) {
        totalMinutes = (totalMinutes ?? 0) + lesson.estimated_minutes;
      }

      let state: LessonState;
      if (completed) {
        state = 'completed';
      } else if (!currentAssigned) {
        state = 'current';
        currentAssigned = true;
      } else {
        state = 'pending';
      }

      return {
        id: lesson.id,
        title: lesson.title,
        order: lesson.order,
        estimatedMinutes: lesson.estimated_minutes,
        completed,
        state,
      };
    });

    const totalCount = lessons.length;
    const status: UnitStatus =
      totalCount === 0
        ? 'pending'
        : completedCount === totalCount
          ? 'completed'
          : completedCount > 0
            ? 'in_progress'
            : 'pending';

    return {
      id: row.id,
      courseId: row.course_id,
      courseTitle: row.course?.title ?? '',
      title: row.title,
      description: row.description,
      order: row.order,
      status,
      lessons,
      completedCount,
      totalCount,
      totalMinutes,
      interactiveTitle: row.interactive_title,
      interactiveDescription: row.interactive_description,
      quiz,
    };
  }

  async createUnitQuiz(unitId: string, title: string): Promise<{ id: string; title: string }> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .insert({ unit_id: unitId, title, status: 'published' })
      .select('id, title')
      .single();

    if (error) throw error;
    return { id: data['id'] as string, title: data['title'] as string };
  }

  async deleteUnitQuiz(quizId: string): Promise<void> {
    const { error } = await this.supabase.from('quizzes').delete().eq('id', quizId);
    if (error) throw error;
  }

  private async loadUnitQuiz(unitId: string): Promise<{ id: string; title: string } | null> {
    const { data, error } = await this.supabase
      .from('quizzes')
      .select('id, title')
      .eq('unit_id', unitId)
      .maybeSingle();

    if (error) throw error;
    return data ? { id: data['id'] as string, title: data['title'] as string } : null;
  }

  async updateUnitInteractive(unitId: string, input: UnitInteractiveInput): Promise<void> {
    const { error } = await this.supabase
      .from('units')
      .update({
        interactive_title: input.title,
        interactive_description: input.description,
      })
      .eq('id', unitId);

    if (error) throw error;
  }

  async deleteUnitInteractive(unitId: string): Promise<void> {
    const { error } = await this.supabase
      .from('units')
      .update({ interactive_title: null, interactive_description: null })
      .eq('id', unitId);

    if (error) throw error;
  }

  async createUnit(
    courseId: string,
    nextOrder: number,
    input: { title: string; description: string | null },
  ): Promise<CourseUnit> {
    const { data, error } = await this.supabase
      .from('units')
      .insert({
        course_id: courseId,
        title: input.title,
        description: input.description,
        order: nextOrder,
        status: 'published',
      })
      .select('id, title, description, order')
      .single();

    if (error) throw error;

    return {
      id: data['id'] as string,
      title: data['title'] as string,
      description: data['description'] as string | null,
      order: data['order'] as number,
      lessons: [],
      status: 'pending',
    };
  }

  async updateUnit(unitId: string, input: { title: string; description: string | null }): Promise<void> {
    const { error } = await this.supabase
      .from('units')
      .update({ title: input.title, description: input.description, updated_at: new Date().toISOString() })
      .eq('id', unitId);

    if (error) throw error;
  }

  async deleteUnit(unitId: string): Promise<void> {
    const { error } = await this.supabase.from('units').delete().eq('id', unitId);
    if (error) throw error;
  }

  async createLesson(unitId: string, nextOrder: number, title: string): Promise<UnitLesson> {
    const { data, error } = await this.supabase
      .from('lessons')
      .insert({ unit_id: unitId, title, order: nextOrder, status: 'published' })
      .select('id, title, order, estimated_minutes')
      .single();

    if (error) throw error;

    return {
      id: data['id'] as string,
      title: data['title'] as string,
      order: data['order'] as number,
      estimatedMinutes: data['estimated_minutes'] as number | null,
      completed: false,
      state: 'pending',
    };
  }

  async updateLessonTitle(lessonId: string, title: string): Promise<void> {
    const { error } = await this.supabase
      .from('lessons')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', lessonId);

    if (error) throw error;
  }

  async deleteLesson(lessonId: string): Promise<void> {
    const { error } = await this.supabase.from('lessons').delete().eq('id', lessonId);
    if (error) throw error;
  }

  async updateCourseImage(courseId: string, file: File | null, removeImage: boolean): Promise<string | null> {
    const imagePath = file ? await this.uploadCourseMedia(file) : removeImage ? null : undefined;
    if (imagePath === undefined) return this.resolveMediaUrl(null);

    const { data, error } = await this.supabase
      .from('courses')
      .update({ image_path: imagePath, updated_at: new Date().toISOString() })
      .eq('id', courseId)
      .select('image_path')
      .single();

    if (error) throw error;

    return this.resolveMediaUrl((data as { image_path: string | null }).image_path);
  }

  private async uploadCourseMedia(file: File): Promise<string> {
    const extension = file.name.split('.').pop() ?? 'jpg';
    const path = `${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.storage.from(COURSE_MEDIA_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw error;

    return path;
  }

  private resolveMediaUrl(path: string | null): string | null {
    return path ? this.supabase.storage.from(COURSE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl : null;
  }

  private async loadCompletedLessonIds(userId: string, lessonIds: string[]): Promise<Set<string>> {
    if (lessonIds.length === 0) return new Set();

    const { data, error } = await this.supabase
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .in('lesson_id', lessonIds);

    if (error) throw error;

    return new Set((data ?? []).map((row) => row['lesson_id'] as string));
  }
}
