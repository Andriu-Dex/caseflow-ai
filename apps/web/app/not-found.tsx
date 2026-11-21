import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';

// Any address CASEFlow does not have, in the person's language and with a way back.
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <Compass className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">No encontramos esta página</h1>
      <p className="text-sm text-muted-foreground">
        Puede que la dirección haya cambiado o que la página ya no exista.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/projects">Ver proyectos</Link>
        </Button>
      </div>
    </div>
  );
}
