import { dataModelReviewQuestions } from '@caseflow-ai/contracts';

export function DataModelReviewNotice({ model }: { model: unknown }) {
  const questions = dataModelReviewQuestions(model);
  if (!questions.length) return null;
  return (
    <aside
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      aria-label="Decisiones pendientes del modelo"
    >
      <p className="font-medium">Antes de avanzar, revise los datos pendientes</p>
      <ul className="mt-2 list-disc pl-5">
        {questions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>
      <p className="mt-2">
        Puede editar el modelo manualmente. Aprobar un modelo conceptual no garantiza que sus reglas
        ya estén implementadas.
      </p>
    </aside>
  );
}
