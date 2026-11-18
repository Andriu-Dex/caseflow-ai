// A built-in starting point (DEC-176): generic data, validated when loaded.
export const ACCESO_USUARIOS_ROLES = {
  name: 'Acceso, usuarios, roles y auditoría',
  description:
    'Inicio y cierre de sesión con cuentas individuales, gestión de usuarios y roles, y registro de los accesos. Sirve como base de casi cualquier sistema con varios tipos de usuario.',
  content: {
    requirements: [
      {
        key: 'RF-001',
        requirementType: 'FUNCTIONAL',
        name: 'Iniciar sesión con una cuenta individual',
        description:
          'El sistema debe permitir que cada usuario activo inicie sesión con su identificador y su contraseña, y debe rechazar las credenciales inválidas y las cuentas desactivadas.',
        priority: 'HIGH',
        actors: ['Usuario'],
        preconditions: ['El usuario tiene una cuenta activa.'],
        postconditions: ['El usuario accede a las opciones de su rol.'],
      },
      {
        key: 'RF-002',
        requirementType: 'FUNCTIONAL',
        name: 'Cerrar la sesión',
        description:
          'El sistema debe permitir que el usuario cierre su sesión, que deja de ser válida para cualquier operación.',
        priority: 'MEDIUM',
        actors: ['Usuario'],
        preconditions: ['El usuario inició sesión.'],
        postconditions: ['La sesión queda cerrada.'],
        dependsOn: ['RF-001'],
      },
      {
        key: 'RF-003',
        requirementType: 'FUNCTIONAL',
        name: 'Crear usuarios',
        description:
          'El sistema debe permitir que un administrador cree usuarios con su nombre, su identificador único y al menos un rol.',
        priority: 'HIGH',
        actors: ['Administrador'],
        postconditions: ['El nuevo usuario puede iniciar sesión.'],
      },
      {
        key: 'RF-004',
        requirementType: 'FUNCTIONAL',
        name: 'Desactivar usuarios',
        description:
          'El sistema debe permitir que un administrador desactive un usuario sin borrarlo, de modo que no pueda iniciar sesión y su historial se conserve.',
        priority: 'MEDIUM',
        actors: ['Administrador'],
        postconditions: ['El usuario desactivado no puede iniciar sesión.'],
        dependsOn: ['RF-003'],
      },
      {
        key: 'RF-005',
        requirementType: 'FUNCTIONAL',
        name: 'Asignar roles a un usuario',
        description:
          'El sistema debe permitir que un administrador asigne y retire roles de un usuario; cada rol determina las opciones a las que el usuario accede.',
        priority: 'HIGH',
        actors: ['Administrador'],
        postconditions: ['El usuario accede solo a las opciones de sus roles.'],
        dependsOn: ['RF-003'],
      },
      {
        key: 'RF-006',
        requirementType: 'FUNCTIONAL',
        name: 'Consultar el registro de accesos',
        description:
          'El sistema debe registrar cada inicio de sesión, exitoso o rechazado, con el usuario, el resultado y el instante, y permitir que un administrador lo consulte.',
        priority: 'MEDIUM',
        actors: ['Administrador'],
        postconditions: ['El administrador ve los accesos del periodo consultado.'],
      },
      {
        key: 'RNF-001',
        requirementType: 'NON_FUNCTIONAL',
        name: 'Contraseñas protegidas',
        description:
          'Las contraseñas deben guardarse protegidas con un algoritmo de derivación de claves y nunca mostrarse ni registrarse.',
        priority: 'HIGH',
      },
    ],
    useCases: [
      {
        key: 'CU-001',
        name: 'Iniciar sesión',
        objective: 'Acceder al sistema con una cuenta individual.',
        primaryActor: 'Usuario',
        preconditions: ['El usuario tiene una cuenta activa.'],
        postconditions: ['El usuario accede a las opciones de su rol.'],
        mainFlow: [
          {
            actor: 'Usuario',
            action: 'Introduce su identificador y su contraseña.',
          },
          {
            actor: 'Sistema',
            action: 'Comprueba las credenciales y que la cuenta esté activa.',
          },
          {
            actor: 'Sistema',
            action: 'Abre la sesión y muestra las opciones de su rol.',
          },
        ],
        alternativeFlows: [
          {
            name: 'Credenciales inválidas',
            condition: 'El identificador o la contraseña no coinciden.',
            steps: [
              {
                actor: 'Sistema',
                action: 'Rechaza el acceso sin indicar cuál dato falló.',
              },
            ],
          },
        ],
        requirementKeys: ['RF-001', 'RNF-001'],
      },
      {
        key: 'CU-002',
        name: 'Cerrar sesión',
        objective: 'Terminar la sesión de trabajo.',
        primaryActor: 'Usuario',
        preconditions: ['El usuario inició sesión.'],
        postconditions: ['La sesión queda cerrada.'],
        mainFlow: [
          {
            actor: 'Usuario',
            action: 'Elige cerrar la sesión.',
          },
          {
            actor: 'Sistema',
            action: 'Invalida la sesión y vuelve al inicio de sesión.',
          },
        ],
        requirementKeys: ['RF-002'],
      },
      {
        key: 'CU-003',
        name: 'Crear usuario',
        objective: 'Dar acceso a una nueva persona.',
        primaryActor: 'Administrador',
        postconditions: ['El nuevo usuario puede iniciar sesión.'],
        mainFlow: [
          {
            actor: 'Administrador',
            action: 'Introduce el nombre, el identificador y los roles.',
          },
          {
            actor: 'Sistema',
            action: 'Comprueba que el identificador no exista y crea el usuario.',
          },
        ],
        requirementKeys: ['RF-003', 'RF-005'],
      },
      {
        key: 'CU-004',
        name: 'Desactivar usuario',
        objective: 'Retirar el acceso sin perder el historial.',
        primaryActor: 'Administrador',
        postconditions: ['El usuario desactivado no puede iniciar sesión.'],
        mainFlow: [
          {
            actor: 'Administrador',
            action: 'Elige el usuario y confirma la desactivación.',
          },
          {
            actor: 'Sistema',
            action: 'Desactiva la cuenta y cierra sus sesiones abiertas.',
          },
        ],
        requirementKeys: ['RF-004'],
      },
      {
        key: 'CU-005',
        name: 'Asignar roles',
        objective: 'Definir a qué opciones accede un usuario.',
        primaryActor: 'Administrador',
        postconditions: ['El usuario accede solo a las opciones de sus roles.'],
        mainFlow: [
          {
            actor: 'Administrador',
            action: 'Elige el usuario y marca sus roles.',
          },
          {
            actor: 'Sistema',
            action: 'Guarda los roles del usuario.',
          },
        ],
        requirementKeys: ['RF-005'],
      },
      {
        key: 'CU-006',
        name: 'Consultar accesos',
        objective: 'Revisar quién accedió y cuándo.',
        primaryActor: 'Administrador',
        mainFlow: [
          {
            actor: 'Administrador',
            action: 'Elige el periodo y, si quiere, un usuario.',
          },
          {
            actor: 'Sistema',
            action: 'Muestra los accesos con su resultado e instante.',
          },
        ],
        requirementKeys: ['RF-006'],
      },
    ],
    dataModel: {
      title: 'Acceso, usuarios y roles',
      entities: [
        {
          localId: 'usuario',
          name: 'Usuario',
          attributes: [
            {
              name: 'Identificador',
              type: 'UUID',
              required: true,
              primaryKey: true,
              unique: true,
            },
            {
              name: 'Nombre',
              type: 'STRING',
              required: true,
              primaryKey: false,
              unique: false,
            },
            {
              name: 'Identificador de acceso',
              type: 'STRING',
              required: true,
              primaryKey: false,
              unique: true,
            },
            {
              name: 'Contraseña protegida',
              type: 'STRING',
              required: true,
              primaryKey: false,
              unique: false,
            },
            {
              name: 'Activo',
              type: 'BOOLEAN',
              required: true,
              primaryKey: false,
              unique: false,
            },
          ],
        },
        {
          localId: 'rol',
          name: 'Rol',
          attributes: [
            {
              name: 'Identificador',
              type: 'UUID',
              required: true,
              primaryKey: true,
              unique: true,
            },
            {
              name: 'Nombre',
              type: 'STRING',
              required: true,
              primaryKey: false,
              unique: true,
            },
          ],
        },
        {
          localId: 'acceso',
          name: 'Registro de acceso',
          attributes: [
            {
              name: 'Identificador',
              type: 'UUID',
              required: true,
              primaryKey: true,
              unique: true,
            },
            {
              name: 'Resultado',
              type: 'STRING',
              required: true,
              primaryKey: false,
              unique: false,
            },
            {
              name: 'Instante',
              type: 'DATETIME',
              required: true,
              primaryKey: false,
              unique: false,
            },
          ],
        },
      ],
      relationships: [
        {
          sourceEntityId: 'usuario',
          targetEntityId: 'rol',
          name: 'tiene',
          sourceCardinality: 'ZERO_OR_MORE',
          targetCardinality: 'ONE_OR_MORE',
        },
        {
          sourceEntityId: 'usuario',
          targetEntityId: 'acceso',
          name: 'registra',
          sourceCardinality: 'ZERO_OR_ONE',
          targetCardinality: 'ZERO_OR_MORE',
        },
      ],
    },
  },
};
