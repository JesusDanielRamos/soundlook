import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ContentStatus } from '../../core/models/content.model';
import { SupabaseClientService } from '../../core/services/supabase-client.service';

const BUCKET = 'glossary-media';

// Categorías predefinidas ofrecidas al crear un término — un catálogo fijo
// evita duplicados por typos ("Efecto" vs "Efectos") en el filtro lateral.
export const GLOSSARY_CATEGORIES: readonly string[] = [
  'Efectos',
  'Procesamiento',
  'Fundamentos',
  'Hardware',
  'Herramientas',
  'Producción',
  'Técnico',
  'Software',
  'Otros',
];

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  category: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  status: ContentStatus;
}

export interface GlossaryTermInput {
  term: string;
  definition: string;
  category: string | null;
  videoUrl: string | null;
  status: ContentStatus;
  imageFile: File | null;
}

export interface GlossaryTermUpdateInput extends GlossaryTermInput {
  // Si es true y no se manda imageFile nuevo, se quita la imagen existente.
  removeImage: boolean;
}

interface GlossaryTermRow {
  id: string;
  term: string;
  definition: string;
  category: string | null;
  image_path: string | null;
  video_url: string | null;
  status: ContentStatus;
}

@Injectable({ providedIn: 'root' })
export class GlossaryService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly auth = inject(AuthService);

  // RLS ya limita a lo publicado para el rol 'estudiante' (y a cualquier
  // visitante anónimo, ya que el glosario es de lectura pública).
  async listTerms(): Promise<GlossaryTerm[]> {
    const { data, error } = await this.supabase
      .from('glossary_terms')
      .select('id, term, definition, category, image_path, video_url, status')
      .order('term', { ascending: true });

    if (error) throw error;

    return (data as GlossaryTermRow[]).map((row) => this.toGlossaryTerm(row));
  }

  async createTerm(input: GlossaryTermInput): Promise<GlossaryTerm> {
    const userId = this.auth.session()?.user.id;
    if (!userId) throw new Error('No hay sesión activa.');

    const imagePath = input.imageFile ? await this.uploadImage(input.imageFile) : null;

    const { data, error } = await this.supabase
      .from('glossary_terms')
      .insert({
        term: input.term,
        definition: input.definition,
        category: input.category,
        video_url: input.videoUrl,
        image_path: imagePath,
        status: input.status,
        created_by: userId,
      })
      .select('id, term, definition, category, image_path, video_url, status')
      .single();

    if (error) throw error;

    return this.toGlossaryTerm(data as GlossaryTermRow);
  }

  async updateTerm(id: string, input: GlossaryTermUpdateInput): Promise<GlossaryTerm> {
    const updates: Record<string, unknown> = {
      term: input.term,
      definition: input.definition,
      category: input.category,
      video_url: input.videoUrl,
      status: input.status,
      updated_at: new Date().toISOString(),
    };

    if (input.imageFile) {
      updates['image_path'] = await this.uploadImage(input.imageFile);
    } else if (input.removeImage) {
      updates['image_path'] = null;
    }

    const { data, error } = await this.supabase
      .from('glossary_terms')
      .update(updates)
      .eq('id', id)
      .select('id, term, definition, category, image_path, video_url, status')
      .single();

    if (error) throw error;

    return this.toGlossaryTerm(data as GlossaryTermRow);
  }

  async deleteTerm(id: string): Promise<void> {
    const { error } = await this.supabase.from('glossary_terms').delete().eq('id', id);
    if (error) throw error;
  }

  private async uploadImage(file: File): Promise<string> {
    const extension = file.name.split('.').pop() ?? 'jpg';
    const path = `${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw error;

    return path;
  }

  private toGlossaryTerm(row: GlossaryTermRow): GlossaryTerm {
    const imageUrl = row.image_path
      ? this.supabase.storage.from(BUCKET).getPublicUrl(row.image_path).data.publicUrl
      : null;

    return {
      id: row.id,
      term: row.term,
      definition: row.definition,
      category: row.category,
      imageUrl,
      videoUrl: row.video_url,
      status: row.status,
    };
  }
}
