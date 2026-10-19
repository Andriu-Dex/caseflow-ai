'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function ImplementationPlanPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <div className="flex flex-col gap-6">
          <StructuredKindPage
            kind="IMPLEMENTATION_PLAN"
            title="Plan de implementación"
            projectId={projectId}
          />

          {/* Navigation Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border mt-2">
            <Link href="/construction/design-baseline">
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <ArrowLeft className="size-3.5" />
                Anterior: Aprobación de diseño (Paso 3)
              </Button>
            </Link>

            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              <span>Fase de Construcción · Paso 4 de 5</span>
            </div>

            <Link href="/construction/generation-runs">
              <Button size="sm" className="gap-2 text-xs font-semibold">
                Siguiente: Generación de código (Paso 5)
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </RequireActiveProject>
  );
}
