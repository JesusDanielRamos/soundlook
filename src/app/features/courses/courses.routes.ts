import { Routes } from '@angular/router';

export const COURSES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./course-list/course-list').then((m) => m.CourseList),
  },
  {
    path: ':id',
    loadComponent: () => import('./course-detail/course-detail').then((m) => m.CourseDetail),
  },
];
