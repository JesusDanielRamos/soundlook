export type ContentStatus = 'draft' | 'published';

export interface Course {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  order: number;
  status: ContentStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  unitId: string;
  title: string;
  contentHtml: string | null;
  order: number;
  status: ContentStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
