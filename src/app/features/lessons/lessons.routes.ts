import { Routes } from '@angular/router';

export const LESSONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./lesson-list/lesson-list').then((m) => m.LessonList),
  },
  {
    path: ':id',
    loadComponent: () => import('./lesson-detail/lesson-detail').then((m) => m.LessonDetail),
  },
];
