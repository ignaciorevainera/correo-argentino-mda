export const auditDictionary = {
  offices: {
    create: (username: string, nis: string) =>
      `${username} ha registrado la nueva oficina ${nis}.`,
    update: (username: string, nis: string) =>
      `${username} ha actualizado los datos de la oficina ${nis}.`,
    delete: (username: string, nis: string) =>
      `${username} ha eliminado el registro de la oficina ${nis}.`,
  },
  users: {
    create: (username: string, targetUser: string, role: string) =>
      `${username} ha creado al usuario ${targetUser} con el rol de ${role}.`,
    roleUpdate: (username: string, targetUser: string, newRole: string) =>
      `${username} ha cambiado el rol del usuario ${targetUser} a ${newRole}.`,
    delete: (username: string, targetUser: string) =>
      `${username} ha eliminado al usuario ${targetUser}.`,
  },
  soportes: {
    create: (username: string, helpDeskName: string) =>
      `${username} ha creado la mesa de ayuda ${helpDeskName}.`,
    update: (username: string, helpDeskName: string) =>
      `${username} ha modificado los datos de la mesa de ayuda ${helpDeskName}.`,
    delete: (username: string, helpDeskName: string) =>
      `${username} ha eliminado la mesa de ayuda ${helpDeskName}.`,
  },
  cubics: {
    create: (username: string, hostname: string) =>
      `${username} ha registrado la cubic ${hostname} en el inventario.`,
    update: (username: string, hostname: string) =>
      `${username} ha actualizado las especificaciones de la cubic ${hostname}.`,
    assign: (username: string, hostname: string, operatorName: string) =>
      `${username} ha asignado la cubic ${hostname} al operador ${operatorName}.`,
    delete: (username: string, hostname: string) =>
      `${username} ha dado de baja la cubic ${hostname}.`,
  },
  contacts: {
    create: (username: string, entityName: string) =>
      `${username} ha añadido un nuevo contacto para la entidad ${entityName}.`,
    update: (username: string, entityName: string) =>
      `${username} ha actualizado el contacto de ${entityName}.`,
    delete: (username: string, entityName: string) =>
      `${username} ha eliminado un contacto de ${entityName}.`,
  },
  aplicativos: {
    create: (username: string, appName: string) =>
      `${username} ha publicado el aplicativo ${appName}.`,
    update: (username: string, appName: string) =>
      `${username} ha actualizado la versión o datos del aplicativo ${appName}.`,
    delete: (username: string, appName: string) =>
      `${username} ha retirado el aplicativo ${appName} del catálogo.`,
  },
  recursos: {
    createCategory: (username: string, categoryName: string) =>
      `${username} ha creado la categoría de recursos ${categoryName}.`,
    createLink: (username: string, linkName: string) =>
      `${username} ha agregado el enlace ${linkName}.`,
    deleteLink: (username: string, linkName: string) =>
      `${username} ha eliminado el enlace ${linkName}.`,
  },
  operadores: {
    create: (username: string, operatorName: string) =>
      `${username} ha registrado al operador ${operatorName}.`,
    updateOperator: (username: string, operatorName: string) =>
      `${username} ha modificado los datos del operador ${operatorName}.`,
    updateSchedule: (username: string) =>
      `${username} ha actualizado el cronograma o las reglas de asignación.`,
  },
} as const;
