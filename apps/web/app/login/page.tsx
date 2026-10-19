'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Label,
  Button,
  Alert,
  AlertDescription,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.auth.login({ email, password });
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-[420px]">
      {/* Platform Branding */}
      <div className="flex flex-col items-center gap-2.5 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary via-indigo-600 to-sky-500 text-primary-foreground shadow-lg shadow-indigo-500/25 ring-4 ring-primary/20">
          <Sparkles className="size-7" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-extrabold tracking-tight text-foreground">
            CASEFlow AI
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Plataforma I-CASE Integrada Asistida por IA
          </span>
        </div>
      </div>

      <Card className="w-full relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-[#161d2f] backdrop-blur-xl shadow-[0_20px_60px_-15px_rgba(79,70,229,0.15),0_10px_25px_-5px_rgba(0,0,0,0.04)] dark:shadow-[0_0_60px_-15px_rgba(99,102,241,0.35),0_25px_50px_-12px_rgba(0,0,0,0.95)] ring-1 ring-slate-900/5 dark:ring-white/15">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-sky-400" />
        <CardHeader className="space-y-1.5 pt-7 pb-2 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Iniciar Sesión
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-muted-foreground">
            Ingresa tus credenciales para acceder al espacio de trabajo.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 px-6 pb-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-semibold text-slate-800 dark:text-foreground"
              >
                Correo Electrónico
              </Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500 dark:text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@ejemplo.com"
                  className="pl-9 text-sm bg-white dark:bg-[#0c1220] border-slate-300/80 dark:border-slate-700/90 text-foreground placeholder:text-muted-foreground/70 shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 focus-visible:border-primary dark:focus-visible:border-primary/80 focus-visible:ring-3 focus-visible:ring-primary/20"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-xs font-semibold text-slate-800 dark:text-foreground"
                >
                  Contraseña
                </Label>
                <Link
                  href="#"
                  className="text-xs text-primary hover:underline font-medium"
                  tabIndex={-1}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500 dark:text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 text-sm bg-white dark:bg-[#0c1220] border-slate-300/80 dark:border-slate-700/90 text-foreground placeholder:text-muted-foreground/70 shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 focus-visible:border-primary dark:focus-visible:border-primary/80 focus-visible:ring-3 focus-visible:ring-primary/20"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  <span className="sr-only">
                    {showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  </span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-3.5">
              <Button
                type="submit"
                className="w-full gap-2 font-semibold shadow-md shadow-indigo-500/20 bg-gradient-to-r from-primary via-indigo-600 to-primary hover:opacity-95 text-primary-foreground transition-all duration-150 py-2.5 active:scale-[0.99]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  'Iniciar Sesión'
                )}
              </Button>
              <div className="text-center text-xs text-muted-foreground">
                ¿No tienes una cuenta?{' '}
                <Link href="/register" className="text-primary hover:underline font-semibold">
                  Regístrate aquí
                </Link>
              </div>
              <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground/75">
                <ShieldCheck className="size-3.5 text-emerald-500/80" aria-hidden="true" />
                <span>Entorno de ingeniería seguro y aislado</span>
              </div>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
