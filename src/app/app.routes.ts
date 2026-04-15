import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { AppShellComponent } from './layouts/app-shell.component';
import { AboutPageComponent } from './pages/about-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { ExpenseCategoriesPageComponent } from './pages/expense-categories-page.component';
import { ExpensesPageComponent } from './pages/expenses-page.component';
import { IncomeCategoriesPageComponent } from './pages/income-categories-page.component';
import { IncomesPageComponent } from './pages/incomes-page.component';
import { LoginPageComponent } from './pages/login-page.component';
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
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        component: DashboardPageComponent,
      },
      {
        path: 'ingresos',
        component: IncomesPageComponent,
      },
      {
        path: 'categorias-ingresos',
        component: IncomeCategoriesPageComponent,
      },
      {
        path: 'gastos',
        component: ExpensesPageComponent,
      },
      {
        path: 'categorias-gastos',
        component: ExpenseCategoriesPageComponent,
      },
      {
        path: 'acerca',
        component: AboutPageComponent,
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
