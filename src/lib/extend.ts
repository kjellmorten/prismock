import { DMMF } from '@prisma/generator-helper';
import { PrismaClient } from '@prisma/client';

import { PrismockClientType } from './client';
import { camelize } from './helpers';

const extendableOperations = [
  'findFirst',
  'findMany',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'create',
  'update',
  'upsert',
  'delete',
  'createMany',
  'createManyAndReturn',
  'updateMany',
  'deleteMany',
  'aggregate',
  'count',
  'groupBy',
];

const shouldExtendModel = (modelIds: string[]) => (modelName: string) => modelIds.includes(camelize(modelName));

// Create an extended function. Sorry for the use of `any` type here, but the typings are so complex that it's not
// worth trying to replicate it.
const createExtendedFunction = (fn: any, modelName: string, operationId: string, query: any) => (args: any) => {
  return fn({ model: modelName, operation: operationId, args, query });
};

/**
 * Extend prismock. This is a crude and limited implementation that will only work for some cases.
 *
 * So far, we only support extending with `query` and specific models. Within each model, we support
 * `$allOperations` (also by providing a function for the model), and all of the different operation
 * methods.
 */
export default function extend(
  prismock: PrismockClientType,
  models: DMMF.Model[],
  extension: Parameters<PrismaClient['$extends']>[0],
) {
  if (typeof extension !== 'object' || !extension.query) {
    return prismock;
  }

  const allModelNames = models.map((model) => model.name);
  const modelNamesToExtend = allModelNames.filter(shouldExtendModel(Object.keys(extension.query)));
  const query = extension.query;

  const extendedModels = modelNamesToExtend.reduce((models, modelName) => {
    const modelId = camelize(modelName);
    const ext = query[modelId as keyof typeof query];
    const modelToExtend = prismock[modelId as keyof PrismockClientType];

    // Handle function or $allOperations extension
    if (typeof ext === 'function' || ext?.$allOperations) {
      const fn = typeof ext === 'function' ? ext : ext?.$allOperations;

      if (typeof fn !== 'function') {
        return { ...models, [modelId]: modelToExtend };
      }

      const extendedModel = extendableOperations.reduce((model, operationId) => {
        const originalQuery = modelToExtend[operationId as keyof typeof modelToExtend];
        const extendedFn = createExtendedFunction(fn, modelName, operationId, originalQuery);
        return { ...model, [operationId]: extendedFn };
      }, {});

      return { ...models, [modelId]: extendedModel };
    }
    // Handle object with specific operation extensions
    else if (typeof ext === 'object') {
      const operationIdsToExtend = Object.keys(ext);
      const extendedModel = extendableOperations.reduce((model, operationId) => {
        const originalQuery = modelToExtend[operationId as keyof typeof modelToExtend];
        const fn = ext[operationId as keyof typeof ext];

        if (operationIdsToExtend.includes(operationId) && typeof fn === 'function') {
          const extendedFn = createExtendedFunction(fn, modelName, operationId, originalQuery);
          return { ...model, [operationId]: extendedFn };
        } else {
          return { ...model, [operationId]: originalQuery };
        }
      }, {});

      return { ...models, [modelId]: extendedModel };
    }
    // If extension type is not recognized, return the original model
    else {
      return { ...models, [modelId]: modelToExtend };
    }
  }, {});

  return { ...prismock, ...extendedModels };
}
