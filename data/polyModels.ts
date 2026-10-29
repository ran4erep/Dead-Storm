import { PolyObjectModel } from '../types';
import polyObjectsData from './polyObjects.json';

export const REGISTERED_POLY_MODELS: Record<string, PolyObjectModel> = {
  ...(polyObjectsData as unknown as Record<string, PolyObjectModel>),
};

export function getPolyModelById(id: any): PolyObjectModel | undefined {
  if (!id) return undefined;
  const strId = typeof id === 'string' ? id : String(id);
  if (REGISTERED_POLY_MODELS[strId]) return REGISTERED_POLY_MODELS[strId];
  const cleanedId = strId.replace(/^poly_/, '');
  if (REGISTERED_POLY_MODELS[cleanedId]) return REGISTERED_POLY_MODELS[cleanedId];
  return undefined;
}

export function registerPolyModel(model: PolyObjectModel) {
  if (model && model.id) {
    REGISTERED_POLY_MODELS[model.id] = model;
  }
}
