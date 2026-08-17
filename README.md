# Soundlook

Plataforma de apoyo para estudiantes con discapacidad auditiva en la materia "Producción de Audio" (UACJ, Diseño de Medios Interactivos). Angular + Taiga UI en el cliente, Supabase (Auth, Database, Storage) como backend, desplegado en Vercel.

Este proyecto fue generado con [Angular CLI](https://github.com/angular/angular-cli) versión 21.1.3.

## Configuración de Supabase

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ejecuta el SQL de `supabase/migrations/0001_init.sql` en el SQL editor del proyecto (crea tablas, RLS y el trigger que asigna el rol `estudiante` por defecto al registrarse).
3. Copia `src/environments/environment.ts` y completa `supabaseUrl`/`supabaseAnonKey` con los valores de tu proyecto (Project Settings → API). Nunca uses la `service_role` key en el cliente.
4. Para producción (Vercel), configura las variables de entorno `SUPABASE_URL` y `SUPABASE_ANON_KEY` — el script `npm run prebuild` (se ejecuta automáticamente antes de `npm run build`) genera `environment.production.ts` a partir de ellas.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
# soundlook
