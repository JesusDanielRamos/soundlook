import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'courses',
        canActivate: [authGuard],
        loadChildren: () =>
          import('./features/courses/courses.routes').then((m) => m.COURSES_ROUTES),
      },
      {
        path: 'lessons',
        canActivate: [authGuard],
        loadChildren: () =>
          import('./features/lessons/lessons.routes').then((m) => m.LESSONS_ROUTES),
      },
      {
        path: 'glossary',
        loadComponent: () => import('./features/glossary/glossary').then((m) => m.Glossary),
      },
      {
        path: 'quizzes',
        canActivate: [authGuard],
        loadChildren: () =>
          import('./features/quizzes/quizzes.routes').then((m) => m.QUIZZES_ROUTES),
      },
      {
        path: 'progress',
        canActivate: [authGuard],
        loadComponent: () => import('./features/progress/progress').then((m) => m.Progress),
      },
    ],
  },
  {
    path: 'auth',
    loadChildren: () => import('./core/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
