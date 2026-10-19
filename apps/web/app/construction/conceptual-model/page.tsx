'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function ConceptualModelPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <div className="flex flex-col gap-6">
          <StructuredKindPage
            kind="CONCEPTUAL_DOMAIN_MODEL"
            title="Modelo conceptual"
            projectId={projectId}
          />

          {/* Navigation Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border mt-2">
            <Link href="/construction/generation-plan">
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <ArrowLeft className="size-3.5" />
                Anterior: Plan de generación (Paso 1)
              </Button>
            </Link>

            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              <span>Fase de Construcción · Paso 2 de 5</span>
            </div>

            <Link href="/construction/design-baseline">
              <Button size="sm" className="gap-2 text-xs font-semibold">
                Siguiente: Aprobación de diseño (Paso 3)
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </RequireActiveProject>
  );
}
