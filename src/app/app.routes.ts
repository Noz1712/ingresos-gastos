import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { AppShellComponent } from './layouts/app-shell.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { ExpenseCatalogPageComponent } from './pages/expense-catalog-page.component';
import { ExpenseCategoriesPageComponent } from './pages/expense-categories-page.component';
import { IncomeCatalogPageComponent } from './pages/income-catalog-page.component';
import { IncomeCategoriesPageComponent } from './pages/income-categories-page.component';
import { LoginPageComponent } from './pages/login-page.component';
import { MovementsPageComponent } from './pages/movements-page.component';
import { ProfilePageComponent } from './pages/profile-page.component';

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
        component: DashboardPageComponent,
      },
      {
        path: 'movimientos',
        component: MovementsPageComponent,
      },
      {
        path: 'categorias-ingresos',
        component: IncomeCategoriesPageComponent,
      },
      {
        path: 'catalogo-ingresos',
        component: IncomeCatalogPageComponent,
      },
      {
        path: 'catalogo-gastos',
        component: ExpenseCatalogPageComponent,
      },
      {
        path: 'categorias-gastos',
        component: ExpenseCategoriesPageComponent,
      },
      {
        path: 'perfil',
        component: ProfilePageComponent,
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
