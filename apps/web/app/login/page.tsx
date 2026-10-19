'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Lock, Mail, Sparkles } from 'lucide-react';
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
    <div className="flex flex-col items-center gap-5 w-full max-w-sm">
      {/* Platform Branding */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-indigo-600 text-primary-foreground shadow-md ring-4 ring-primary/10">
          <Sparkles className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-extrabold tracking-tight text-foreground">CASEFlow AI</span>
          <span className="text-xs text-muted-foreground">
            Plataforma I-CASE Integrada Asistida por IA
          </span>
        </div>
      </div>

      <Card className="w-full shadow-xl relative overflow-hidden border-border/80">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-sky-500" />
        <CardHeader className="space-y-1 pt-6 text-center">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            Iniciar Sesión
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Ingresa tus credenciales para acceder al espacio de trabajo.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold">
                Correo Electrónico
              </Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@ejemplo.com"
                  className="pl-9 text-sm"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold">
                  Contraseña
                </Label>
                <Link href="#" className="text-xs text-primary hover:underline" tabIndex={-1}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 text-sm"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
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
                className="w-full gap-2 font-medium shadow-xs"
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
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
