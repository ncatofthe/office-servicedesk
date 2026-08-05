const resolveTaskServiceDeskReferences = async(db, refs) => {
    const applyRouting = refs.applyRouting === true;
    const fallbackFolderId = Object.prototype.hasOwnProperty.call(refs, 'fallbackFolderId')
        ? refs.fallbackFolderId
        : undefined;
    const finalRefs = {
        folderId: Object.prototype.hasOwnProperty.call(refs, 'folderId') ? refs.folderId : undefined,
        entityId: Object.prototype.hasOwnProperty.call(refs, 'entityId') ? refs.entityId : undefined,
        typeId: Object.prototype.hasOwnProperty.call(refs, 'typeId') ? refs.typeId : undefined,
        subtypeId: Object.prototype.hasOwnProperty.call(refs, 'subtypeId') ? refs.subtypeId : undefined
    };

    const resolved = {};
    let folder = null;
    let entity = null;
    let type = null;
    let subtype = null;

    if (finalRefs.folderId !== undefined) {
        if (finalRefs.folderId === null) {
            resolved.folderId = null;
        } else if (typeof finalRefs.folderId !== 'string' || finalRefs.folderId.trim().length === 0) {
            throw new Error('folderId должен быть непустой строкой или null.');
        } else {
            folder = await db.ticketFolder.findFirst({
                where: { id: finalRefs.folderId, isActive: true },
                select: { id: true }
            });
            if (!folder) {
                throw new Error('Активная папка заявки не найдена.');
            }
            resolved.folderId = folder.id;
        }
    }

    if (finalRefs.entityId !== undefined) {
        if (finalRefs.entityId === null) {
            resolved.entityId = null;
        } else if (typeof finalRefs.entityId !== 'string' || finalRefs.entityId.trim().length === 0) {
            throw new Error('entityId должен быть непустой строкой или null.');
        } else {
            entity = await db.ticketEntity.findFirst({
                where: { id: finalRefs.entityId, isActive: true },
                select: { id: true }
            });
            if (!entity) {
                throw new Error('Активная сущность заявки не найдена.');
            }
            resolved.entityId = entity.id;
        }
    }

    if (finalRefs.typeId !== undefined) {
        if (finalRefs.typeId === null) {
            resolved.typeId = null;
        } else if (typeof finalRefs.typeId !== 'string' || finalRefs.typeId.trim().length === 0) {
            throw new Error('typeId должен быть непустой строкой или null.');
        } else {
            type = await db.ticketType.findFirst({
                where: { id: finalRefs.typeId, isActive: true },
                select: { id: true, folderId: true, entityId: true, teamId: true }
            });
            if (!type) {
                throw new Error('Активный тип заявки не найден.');
            }
            resolved.typeId = type.id;
        }
    }

    if (finalRefs.subtypeId !== undefined) {
        if (finalRefs.subtypeId === null) {
            resolved.subtypeId = null;
        } else if (typeof finalRefs.subtypeId !== 'string' || finalRefs.subtypeId.trim().length === 0) {
            throw new Error('subtypeId должен быть непустой строкой или null.');
        } else {
            subtype = await db.ticketSubtype.findFirst({
                where: { id: finalRefs.subtypeId, isActive: true },
                select: {
                    id: true,
                    typeId: true,
                    folderId: true,
                    teamId: true,
                    type: {
                        select: {
                            id: true,
                            folderId: true,
                            entityId: true,
                            teamId: true
                        }
                    }
                }
            });
            if (!subtype) {
                throw new Error('Активный подтип заявки не найден.');
            }
            resolved.subtypeId = subtype.id;
        }
    }

    const effectiveFolderId = finalRefs.folderId === undefined ? undefined : resolved.folderId;
    const effectiveEntityId = finalRefs.entityId === undefined ? undefined : resolved.entityId;
    const effectiveTypeId = finalRefs.typeId === undefined ? undefined : resolved.typeId;
    const effectiveSubtypeId = finalRefs.subtypeId === undefined ? undefined : resolved.subtypeId;
    const effectiveType = type || (subtype ? subtype.type : null);
    const routingFolderId = subtype?.folderId || effectiveType?.folderId || null;
    const routingTeamId = subtype?.teamId || effectiveType?.teamId || null;

    if (effectiveSubtypeId && !effectiveTypeId) {
        throw new Error('При выборе подтипа нужно указать тип заявки.');
    }

    if (subtype && effectiveTypeId && subtype.typeId !== effectiveTypeId) {
        throw new Error('Подтип не относится к выбранному типу заявки.');
    }

    if (effectiveType && effectiveEntityId && effectiveType.entityId && effectiveType.entityId !== effectiveEntityId) {
        throw new Error('Тип заявки привязан к другой сущности.');
    }

    if (effectiveFolderId && routingFolderId && routingFolderId !== effectiveFolderId) {
        throw new Error('Для выбранного типа или подтипа настроена другая папка маршрутизации.');
    }

    if (applyRouting && finalRefs.folderId === undefined) {
        const nextFolderId = routingFolderId || fallbackFolderId;
        if (nextFolderId === null) {
            resolved.folderId = null;
        } else if (nextFolderId !== undefined) {
            const routedFolder = await db.ticketFolder.findFirst({
                where: { id: nextFolderId, isActive: true },
                select: { id: true }
            });
            if (!routedFolder) {
                throw new Error('Активная папка маршрутизации не найдена.');
            }
            resolved.folderId = routedFolder.id;
        }
    }

    return {
        ...resolved,
        ...(applyRouting ? { routingTeamId } : {})
    };
};

module.exports = {
    resolveTaskServiceDeskReferences
};
