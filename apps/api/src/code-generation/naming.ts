// Deterministic naming conventions shared by every generator of the
// CASEFLOW_WEB_TS_V1 template. Identifiers in an Implementation Plan are
// already English PascalCase/camelCase (contract-enforced).

export const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
export const upperFirst = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

// OrderItem -> order_item
export const snakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

// OrderItem -> order-item
export const kebabCase = (value: string) => snakeCase(value).replace(/_/g, '-');

// OrderItem -> order_items (table name)
export const tableName = (entity: string) => snakeCase(pluralize(entity));

// OrderItem -> /order-items (REST collection path)
export const collectionPath = (entity: string) => `/${kebabCase(pluralize(entity))}`;

// Optional list filters every LIST endpoint accepts: each visible enum field
// and each MANY_TO_ONE relation (by its id). Validated by the server.
export interface ListFilter {
  name: string;
  label: string;
  enumValues?: string[];
}
export function listFilters(entity: {
  fields: {
    name: string;
    type: string;
    internal?: boolean;
    label?: string;
    enumValues?: string[];
  }[];
  relations?: { name: string; kind: string; label?: string }[];
}): ListFilter[] {
  return [
    ...entity.fields
      .filter((field) => field.type === 'ENUM' && !field.internal && field.enumValues?.length)
      .map((field) => ({
        name: field.name,
        label: field.label ?? field.name,
        enumValues: field.enumValues,
      })),
    ...(entity.relations ?? [])
      .filter((relation) => relation.kind === 'MANY_TO_ONE')
      .map((relation) => ({ name: `${relation.name}Id`, label: relation.label ?? relation.name })),
  ];
}

export class PlanGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanGenerationError';
  }
}

export function customEndpointOperationId(endpoint: { method: string; path: string }): string {
  const words = endpoint.path
    .split('/')
    .filter((segment) => segment && !segment.startsWith(':'))
    .flatMap((segment) => segment.split('-'))
    .map(upperFirst)
    .join('');
  return `${endpoint.method.toLowerCase()}${words}`;
}
