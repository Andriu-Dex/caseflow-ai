'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
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

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: 'bg-muted' };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  switch (score) {
    case 0:
    case 1:
      return { score: 1, label: 'Muy débil', color: 'bg-red-500' };
    case 2:
      return { score: 2, label: 'Débil', color: 'bg-orange-500' };
    case 3:
      return { score: 3, label: 'Regular', color: 'bg-yellow-500' };
    case 4:
      return { score: 4, label: 'Fuerte', color: 'bg-emerald-500' };
    case 5:
      return { score: 5, label: 'Muy fuerte', color: 'bg-emerald-600' };
    default:
      return { score: 0, label: '', color: 'bg-muted' };
  }
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const strength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await api.auth.register({ email, password, displayName });
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Crear Cuenta</CardTitle>
        <CardDescription>Regístrate para empezar a usar CASEFlow AI.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="displayName">Nombre</Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tu nombre"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@ejemplo.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                <span className="sr-only">
                  {showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                </span>
              </button>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 w-full rounded-full transition-colors ${
                      password.length > 0 && level <= strength.score
                        ? strength.color
                        : 'bg-secondary'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs flex justify-between text-muted-foreground">
                <span>Mínimo 8 caracteres.</span>
                {password.length > 0 && (
                  <span
                    className="font-medium"
                    style={{
                      color:
                        strength.color === 'bg-red-500'
                          ? '#ef4444'
                          : strength.color === 'bg-orange-500'
                            ? '#f97316'
                            : strength.color === 'bg-yellow-500'
                              ? '#eab308'
                              : strength.color === 'bg-emerald-500'
                                ? '#10b981'
                                : '#059669',
                    }}
                  >
                    {strength.label}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                <span className="sr-only">
                  {showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                </span>
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creando cuenta...' : 'Registrarse'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              ¿Ya tienes una cuenta?{' '}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Inicia sesión
              </Link>
            </div>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
