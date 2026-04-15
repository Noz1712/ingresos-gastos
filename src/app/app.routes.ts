import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { AppShellComponent } from './layouts/app-shell.component';
import { LoginPageComponent } from './pages/login-page.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPageComponent,
    canActivate: [guestGuard],
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'movimientos',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard-page.component').then((module) => module.DashboardPageComponent),
      },
      {
        path: 'movimientos',
        loadComponent: () =>
          import('./pages/movements-page.component').then((module) => module.MovementsPageComponent),
      },
      {
        path: 'categorias-ingresos',
        loadComponent: () =>
          import('./pages/income-categories-page.component').then((module) => module.IncomeCategoriesPageComponent),
      },
      {
        path: 'catalogo-ingresos',
        loadComponent: () =>
          import('./pages/income-catalog-page.component').then((module) => module.IncomeCatalogPageComponent),
      },
      {
        path: 'catalogo-gastos',
        loadComponent: () =>
          import('./pages/expense-catalog-page.component').then((module) => module.ExpenseCatalogPageComponent),
      },
      {
        path: 'categorias-gastos',
        loadComponent: () =>
          import('./pages/expense-categories-page.component').then((module) => module.ExpenseCategoriesPageComponent),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./pages/profile-page.component').then((module) => module.ProfilePageComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
