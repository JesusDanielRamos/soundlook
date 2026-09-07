import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

export interface CourseListItem {
  id: string;
  title: string;
  description: string | null;
  unitsCount: number;
  lessonsCount: number;
}

export interface CourseLesson {
  id: string;
  title: string;
  order: number;
}

export interface CourseUnit {
  id: string;
  title: string;
  description: string | null;
  order: number;
  lessons: CourseLesson[];
}

export interface CourseWithUnits {
  id: string;
  title: string;
  description: string | null;
  units: CourseUnit[];
}

// Formas mínimas de la respuesta anidada de Supabase — solo los campos que
// pedimos en el select, no el tipo completo de las tablas.
interface CourseListRow {
  id: string;
  title: string;
  description: string | null;
  units: { id: string; lessons: { id: string }[] }[];
}

interface CourseDetailRow {
  id: string;
  title: string;
  description: string | null;
  units: {
    id: string;
    title: string;
    description: string | null;
    order: number;
    lessons: { id: string; title: string; order: number }[];
  }[];
}

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly supabase = inject(SupabaseClientService).client;

  // RLS ya limita courses/units/lessons a lo publicado para el rol
  // 'estudiante', así que no hace falta filtrar status aquí.
  async listCourses(): Promise<CourseListItem[]> {
    const { data, error } = await this.supabase
      .from('courses')
      .select('id, title, description, units ( id, lessons ( id ) )')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data as CourseListRow[]).map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      unitsCount: course.units.length,
      lessonsCount: course.units.reduce((sum, unit) => sum + unit.lessons.length, 0),
    }));
  }

  async getCourse(id: string): Promise<CourseWithUnits | null> {
    const { data, error } = await this.supabase
      .from('courses')
      .select(
        `id, title, description,
         units ( id, title, description, order, lessons ( id, title, order ) )`,
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const course = data as CourseDetailRow;
    const units = [...course.units]
      .sort((a, b) => a.order - b.order)
      .map((unit) => ({
        ...unit,
        lessons: [...unit.lessons].sort((a, b) => a.order - b.order),
      }));

    return { id: course.id, title: course.title, description: course.description, units };
  }
}
