import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

const LESSON_MEDIA_BUCKET = 'lesson-media';

export interface LessonSection {
  id: string;
  title: string;
  content: string;
  order: number;
  imageUrl: string | null;
}

export interface LessonSectionInput {
  title: string;
  content: string;
  imageFile: File | null;
  // Solo aplica en updateSection: si es true y no se manda imageFile nuevo,
  // se quita la imagen existente.
  removeImage?: boolean;
}

export interface LessonQuiz {
  id: string;
  title: string;
}

export interface LessonDetail {
  id: string;
  title: string;
  contentHtml: string | null;
  videoUrl: string | null;
  visualImageUrl: string | null;
  visualLinkUrl: string | null;
  estimatedMinutes: number | null;
  sections: LessonSection[];
  quiz: LessonQuiz | null;
  unitId: string;
  unitOrder: number;
  unitTitle: string;
  courseId: string;
  courseTitle: string;
  positionInUnit: number;
  totalInUnit: number;
  previousLessonId: string | null;
  nextLessonId: string | null;
  completed: boolean;
}

interface LessonRow {
  id: string;
  title: string;
  content_html: string | null;
  video_url: string | null;
  visual_image_path: string | null;
  visual_link_url: string | null;
  estimated_minutes: number | null;
  unit_id: string;
  unit: { id: string; title: string; order: number; course: { id: string; title: string } | null } | null;
  sections: { id: string; title: string; content: string; order: number; image_path: string | null }[];
  quizzes: { id: string; title: string }[] | null;
}

interface LessonSectionRow {
  id: string;
  lesson_id: string;
  title: string;
  content: string;
  order: number;
  image_path: string | null;
}

@Injectable({ providedIn: 'root' })
export class LessonsService {
  private readonly supabase = inject(SupabaseClientService).client;

  async getLesson(lessonId: string, userId: string | null): Promise<LessonDetail | null> {
    const { data, error } = await this.supabase
      .from('lessons')
      .select(
        `id, title, content_html, video_url, visual_image_path, visual_link_url,
         estimated_minutes, unit_id,
         unit:units ( id, title, order, course:courses ( id, title ) ),
         sections:lesson_sections ( id, title, content, order, image_path ),
         quizzes ( id, title )`,
      )
      .eq('id', lessonId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as LessonRow;

    const { data: siblings, error: siblingsError } = await this.supabase
      .from('lessons')
      .select('id')
      .eq('unit_id', row.unit_id)
      .order('order', { ascending: true });

    if (siblingsError) throw siblingsError;

    const siblingIds = (siblings ?? []).map((l) => l['id'] as string);
    const position = siblingIds.indexOf(row.id);

    const completed = userId ? await this.isLessonCompleted(userId, row.id) : false;

    return {
      id: row.id,
      title: row.title,
      contentHtml: row.content_html,
      videoUrl: row.video_url,
      visualImageUrl: row.visual_image_path
        ? this.supabase.storage.from(LESSON_MEDIA_BUCKET).getPublicUrl(row.visual_image_path).data.publicUrl
        : null,
      visualLinkUrl: row.visual_link_url,
      estimatedMinutes: row.estimated_minutes,
      sections: [...row.sections]
        .sort((a, b) => a.order - b.order)
        .map((section) => ({
          id: section.id,
          title: section.title,
          content: section.content,
          order: section.order,
          imageUrl: section.image_path
            ? this.supabase.storage.from(LESSON_MEDIA_BUCKET).getPublicUrl(section.image_path).data.publicUrl
            : null,
        })),
      quiz: row.quizzes && row.quizzes.length > 0 ? { id: row.quizzes[0].id, title: row.quizzes[0].title } : null,
      unitId: row.unit_id,
      unitOrder: row.unit?.order ?? 0,
      unitTitle: row.unit?.title ?? '',
      courseId: row.unit?.course?.id ?? '',
      courseTitle: row.unit?.course?.title ?? '',
      positionInUnit: position === -1 ? 1 : position + 1,
      totalInUnit: siblingIds.length,
      previousLessonId: position > 0 ? siblingIds[position - 1] : null,
      nextLessonId: position !== -1 && position < siblingIds.length - 1 ? siblingIds[position + 1] : null,
      completed,
    };
  }

  async markCompleted(lessonId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.from('lesson_progress').upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    );

    if (error) throw error;
  }

  // nextOrder = 1 + el order más alto de las secciones ya cargadas para esa
  // lección (el componente lo calcula y lo pasa aquí, para no tener que
  // volver a consultar la tabla).
  async createSection(lessonId: string, nextOrder: number, input: LessonSectionInput): Promise<LessonSection> {
    const imagePath = input.imageFile ? await this.uploadSectionImage(input.imageFile) : null;

    const { data, error } = await this.supabase
      .from('lesson_sections')
      .insert({
        lesson_id: lessonId,
        title: input.title,
        content: input.content,
        order: nextOrder,
        image_path: imagePath,
      })
      .select('id, lesson_id, title, content, order, image_path')
      .single();

    if (error) throw error;

    return this.toLessonSection(data as LessonSectionRow);
  }

  async updateSection(sectionId: string, input: LessonSectionInput): Promise<LessonSection> {
    const updates: Record<string, unknown> = {
      title: input.title,
      content: input.content,
      updated_at: new Date().toISOString(),
    };

    if (input.imageFile) {
      updates['image_path'] = await this.uploadSectionImage(input.imageFile);
    } else if (input.removeImage) {
      updates['image_path'] = null;
    }

    const { data, error } = await this.supabase
      .from('lesson_sections')
      .update(updates)
      .eq('id', sectionId)
      .select('id, lesson_id, title, content, order, image_path')
      .single();

    if (error) throw error;

    return this.toLessonSection(data as LessonSectionRow);
  }

  async deleteSection(sectionId: string): Promise<void> {
    const { error } = await this.supabase.from('lesson_sections').delete().eq('id', sectionId);
    if (error) throw error;
  }

  private async uploadSectionImage(file: File): Promise<string> {
    const extension = file.name.split('.').pop() ?? 'jpg';
    const path = `sections/${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.storage.from(LESSON_MEDIA_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw error;

    return path;
  }

  private toLessonSection(row: LessonSectionRow): LessonSection {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      order: row.order,
      imageUrl: row.image_path
        ? this.supabase.storage.from(LESSON_MEDIA_BUCKET).getPublicUrl(row.image_path).data.publicUrl
        : null,
    };
  }

  private async isLessonCompleted(userId: string, lessonId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('lesson_progress')
      .select('status')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .eq('status', 'completed')
      .maybeSingle();

    if (error) throw error;

    return data !== null;
  }
}
