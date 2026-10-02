import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

// Niveles de fortaleza que puede tomar una contraseña, en orden ascendente.
type NivelFortaleza = 'vacia' | 'baja' | 'media' | 'alta';
const ORDEN_FORTALEZA: NivelFortaleza[] = ['vacia', 'baja', 'media', 'alta'];
const FORTALEZA_MINIMA = 'media';

@Component({
  selector: 'app-register',
  imports: [RouterLink, FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly showPassword = signal(false);
  protected readonly hasDisability = signal(false);

  protected readonly semesters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Modelo del formulario. fullName/email/semester/disabilityDescription van
  // por ngModel (FormsModule); password/confirmPassword se manejan igual,
  // pero además alimentan los computed de fortaleza/coincidencia de abajo.
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  // 'other' es un valor distinto de null a propósito: si "Otro" guardara
  // null, el validador required del <select> lo trataría como "sin elegir".
  protected readonly semester = signal<number | 'other' | null>(null);
  protected readonly disabilityDescription = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  // computed(): se recalcula solo cuando password() cambia, así que la barra
  // de fortaleza y el mensaje de confirmación siempre están sincronizados.
  protected readonly passwordStrength = computed(() =>
    this.calcularFortaleza(this.password()),
  );

  // Solo mostramos error de "no coinciden" cuando el usuario ya escribió algo
  // en el campo de confirmación; si está vacío no lo marcamos como error.
  protected readonly passwordsMatch = computed(() => {
    const confirmacion = this.confirmPassword();
    return confirmacion.length === 0 || confirmacion === this.password();
  });

  // --- Mitigación de fuerza bruta / abuso, igual que en login.ts ---
  // Aquí importa menos frenar "adivinar contraseña" (no existe la cuenta
  // todavía) y más frenar scripts que creen cuentas en cadena (spam de
  // registros). Bloqueamos tras varios intentos fallidos seguidos.
  private intentosFallidos = 0;
  private readonly MAX_INTENTOS_FALLIDOS = 5;
  private readonly DURACION_BLOQUEO_MS = 30_000;
  protected readonly bloqueadoHasta = signal<number | null>(null);
  protected readonly segundosRestantes = signal(0);
  private temporizador?: ReturnType<typeof setInterval>;

  protected get formularioBloqueado(): boolean {
    return this.bloqueadoHasta() !== null;
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((show) => !show);
  }

  toggleDisability(checked: boolean): void {
    this.hasDisability.set(checked);
    if (!checked) {
      this.disabilityDescription.set('');
    }
  }

  async onSubmit(form: NgForm): Promise<void> {
    this.errorMessage.set(null);

    if (form.invalid || this.loading() || this.formularioBloqueado) {
      return;
    }

    // Validaciones que no dependen de "required"/"email" del template y que
    // por lo tanto hay que revisar a mano antes de llamar a Supabase.
    if (this.confirmPassword().length === 0 || !this.passwordsMatch()) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }

    if (!this.cumpleFortalezaMinima()) {
      this.errorMessage.set('Elige una contraseña con seguridad media o alta.');
      return;
    }

    if (this.hasDisability() && !this.disabilityDescription().trim()) {
      this.errorMessage.set('Describe brevemente tu discapacidad para poder adaptar tu experiencia.');
      return;
    }

    const email = this.email().trim().toLowerCase();
    const fullName = this.fullName().trim();

    this.loading.set(true);

    const semesterValue = this.semester();

    try {
      await this.auth.signUp(email, this.password(), fullName, {
        semester: typeof semesterValue === 'number' ? semesterValue : null,
        hasDisability: this.hasDisability(),
        disabilityDescription: this.hasDisability() ? this.disabilityDescription().trim() : null,
      });
      this.intentosFallidos = 0;
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      // A diferencia del login, aquí sí es útil decirle al usuario la razón
      // exacta (p. ej. "correo ya registrado"): no hay una cuenta ajena que
      // proteger de enumeración, es la suya propia la que está creando.
      this.errorMessage.set(
        error instanceof Error ? error.message : 'No se pudo crear la cuenta. Intenta de nuevo.',
      );
      this.registrarIntentoFallido();
    } finally {
      this.loading.set(false);
    }
  }

  private cumpleFortalezaMinima(): boolean {
    return (
      ORDEN_FORTALEZA.indexOf(this.passwordStrength().nivel) >=
      ORDEN_FORTALEZA.indexOf(FORTALEZA_MINIMA)
    );
  }

  private registrarIntentoFallido(): void {
    this.intentosFallidos++;

    if (this.intentosFallidos >= this.MAX_INTENTOS_FALLIDOS) {
      this.iniciarBloqueoTemporal();
    }
  }

  private iniciarBloqueoTemporal(): void {
    this.bloqueadoHasta.set(Date.now() + this.DURACION_BLOQUEO_MS);
    this.actualizarSegundosRestantes();

    clearInterval(this.temporizador);
    this.temporizador = setInterval(() => this.actualizarSegundosRestantes(), 1000);
  }

  private actualizarSegundosRestantes(): void {
    const hasta = this.bloqueadoHasta();
    if (hasta === null) return;

    const restante = Math.max(0, Math.ceil((hasta - Date.now()) / 1000));
    this.segundosRestantes.set(restante);

    if (restante === 0) {
      this.bloqueadoHasta.set(null);
      this.intentosFallidos = 0;
      clearInterval(this.temporizador);
    }
  }

  // Reglas simples de fortaleza: suma un punto por cada criterio cumplido.
  // No es un análisis criptográfico serio (para eso existe zxcvbn), pero da
  // una señal útil e inmediata al usuario mientras escribe.
  private calcularFortaleza(password: string): { nivel: NivelFortaleza; porcentaje: number } {
    if (!password) {
      return { nivel: 'vacia', porcentaje: 0 };
    }

    let puntaje = 0;
    if (password.length >= 8) puntaje++;
    if (password.length >= 12) puntaje++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) puntaje++;
    if (/\d/.test(password)) puntaje++;
    if (/[^A-Za-z0-9]/.test(password)) puntaje++;

    const nivel: NivelFortaleza = puntaje <= 2 ? 'baja' : puntaje <= 3 ? 'media' : 'alta';

    // 5 criterios posibles → el porcentaje alimenta el ancho de la barra.
    return { nivel, porcentaje: (puntaje / 5) * 100 };
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }
}
