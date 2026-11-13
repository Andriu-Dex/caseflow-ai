// A minimal entity is valid conceptually, but its capture/display data need
// an explicit human decision before treating it as an implementation model.
export function dataModelReviewQuestions(model: unknown): string[] {
  if (
    !model ||
    typeof model !== 'object' ||
    !('entities' in model) ||
    !Array.isArray(model.entities)
  )
    return [];
  return model.entities.flatMap((entity: unknown) => {
    if (
      !entity ||
      typeof entity !== 'object' ||
      !('attributes' in entity) ||
      !Array.isArray(entity.attributes) ||
      !('name' in entity) ||
      typeof entity.name !== 'string'
    )
      return [];
    const descriptive = entity.attributes.some(
      (attribute: unknown) =>
        attribute !== null &&
        typeof attribute === 'object' &&
        'name' in attribute &&
        typeof attribute.name === 'string' &&
        !('primaryKey' in attribute && attribute.primaryKey) &&
        !/^(id|uuid|identificador)$/i.test(attribute.name),
    );
    return descriptive
      ? []
      : [
          `La entidad «${entity.name}» solo define su identidad. Decida qué datos se capturan y cómo la reconocerá el usuario, o confirme que es deliberadamente conceptual. No se han inventado campos.`,
        ];
  });
}
