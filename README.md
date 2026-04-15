# Ingresos y Gastos

Aplicacion Angular + Firebase para gestion personal de ingresos, gastos, catalogos y pendientes del mes.

## Requisitos

- Node.js 20+
- npm 10+

## Ejecutar en local

```bash
npm install
npm start
```

Abrir en: `http://localhost:4200`

## Scripts utiles

```bash
npm start        # ng serve (modo desarrollo)
npm run build    # build produccion
npm run test     # pruebas
```

## Deploy Firebase

```bash
npm run build
firebase deploy --only firestore,hosting
```

## Estructura principal

- `src/app/pages/` pantallas funcionales
- `src/app/services/` acceso a Firestore/Auth y logica de datos
- `src/app/layouts/` shell y navegacion
- `src/app/models/` contratos de dominio

## Notas

- La app usa componentes standalone.
- Las rutas protegidas usan guards de auth.
- El menu movil incluye barra inferior tipo app para navegacion rapida.
