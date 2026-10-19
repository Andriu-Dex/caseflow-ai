'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { RequireActiveProject } from '../../../components/query-state';
import { StructuredKindPage } from '../../../components/structured-kind-page';

export default function GenerationPlanPage() {
  return (
    <RequireActiveProject>
      {(projectId) => (
        <div className="flex flex-col gap-6">
          <StructuredKindPage
            kind="GENERATION_PLAN"
            title="Plan de generación"
            projectId={projectId}
          />

          {/* Navigation Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border mt-2">
            <Link href="/traceability">
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <ArrowLeft className="size-3.5" />
                Anterior: Trazabilidad (Paso 13)
              </Button>
            </Link>

            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              <span>Fase de Construcción · Paso 1 de 5</span>
            </div>

            <Link href="/construction/conceptual-model">
              <Button size="sm" className="gap-2 text-xs font-semibold">
                Siguiente: Modelo Conceptual (Paso 2)
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </RequireActiveProject>
  );
}
