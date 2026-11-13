import ts from 'typescript';

type Completion = 'NORMAL' | 'RETURN' | 'THROW';

// Conservative: complex control flow is left to runtime tests. Only bodies whose
// reachable paths can all be proven to throw are rejected here.
function completions(statements: readonly ts.Statement[]): Set<Completion> {
  let outcomes = new Set<Completion>(['NORMAL']);
  for (const statement of statements) {
    if (!outcomes.delete('NORMAL')) break;
    let next: Set<Completion>;
    if (ts.isThrowStatement(statement)) next = new Set(['THROW']);
    else if (ts.isReturnStatement(statement)) next = new Set(['RETURN']);
    else if (ts.isBlock(statement)) next = completions(statement.statements);
    else if (ts.isIfStatement(statement))
      next = new Set([
        ...completions([statement.thenStatement]),
        ...(statement.elseStatement ? completions([statement.elseStatement]) : ['NORMAL' as const]),
      ]);
    else if (
      ts.isIterationStatement(statement, false) ||
      ts.isTryStatement(statement) ||
      ts.isSwitchStatement(statement)
    )
      next = new Set(['NORMAL', 'RETURN']);
    else next = new Set(['NORMAL']);
    outcomes = new Set([...outcomes, ...next]);
  }
  return outcomes;
}

export function hasOnlyThrowingPaths(statements: readonly ts.Statement[]): boolean {
  const outcomes = completions(statements);
  return outcomes.size === 1 && outcomes.has('THROW');
}
