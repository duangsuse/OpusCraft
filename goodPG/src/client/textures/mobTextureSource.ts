// Fuente de texturas de criaturas para el renderizador (arte procedural, generado bajo demanda).
import type { MobTexture } from '../render/MobRenderer';
import { generateMobTexture } from './mobTextures';
import { companionTexture } from './companionTextures'; // Fase 6 (gólems/domesticar)
import { skinKey } from '../../shared/companions';
import { vehicleTexture } from './vehicleTextures'; // Fase 7 (transporte)
import { isVehicleModelId } from '../render/vehicleModels';

/** `variant`: pelaje (Fase 6, monturas) o ropa según la profesión (Fase 6, aldeanos). */
export function mobTextureSource(): (id: number, variant?: number) => MobTexture | null {
  return (id, variant = 0) => {
    try {
      if (isVehicleModelId(id)) return vehicleTexture(id, variant); // Fase 7 (transporte): barcas y vagonetas
      // Fase 6 (gólems/domesticar): gólems y gatos (la piel del gato es la variante).
      return companionTexture(skinKey(id, variant)) ?? generateMobTexture(id, variant);
    } catch (e) {
      console.warn('Textura de criatura no disponible', id, e);
      return null;
    }
  };
}
