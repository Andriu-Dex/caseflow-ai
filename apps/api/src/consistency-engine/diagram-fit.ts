// What a system architecture admits: only what runs or is deployed. A
// practice (deployment, configuration, monitoring, backups) or a software
// module drawn as a node is a sign it belongs elsewhere: as a responsibility
// of the node where it happens, or in the software architecture.
type DeploymentContent = {
  nodes?: { localId: string; name: string; kind: string }[];
  links?: { fromLocalId: string; toLocalId: string }[];
};

export function deploymentNodeWarnings(content: unknown): string[] {
  const { nodes = [], links = [] } = (content ?? {}) as DeploymentContent;
  const linked = new Set(links.flatMap((link) => [link.fromLocalId, link.toLocalId]));
  return nodes.flatMap((node) => {
    if (node.kind === 'OTHER')
      return [
        `«${node.name}» no es un cliente, un entorno de ejecución, una base de datos, un almacenamiento ni un servicio externo. Si es una práctica o una responsabilidad, reflejela en el nodo donde ocurre; si es un módulo del software, va en la arquitectura de software.`,
      ];
    if (nodes.length > 1 && !linked.has(node.localId))
      return [
        `«${node.name}» no se comunica con ningún otro nodo. Conéctelo o revise si forma parte del despliegue.`,
      ];
    return [];
  });
}
