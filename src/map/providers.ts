import {
  ArcGisMapServerImageryProvider,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Ion,
  IonResource,
  OpenStreetMapImageryProvider,
  type TerrainProvider,
} from 'cesium';

/**
 * Factory dei provider terreno/imagery: unico punto da toccare per passare
 * da Cesium ion (free tier, token in VITE_CESIUM_ION_TOKEN) a tile
 * self-hosted quando/se il prodotto scala.
 *
 * Senza token l'app funziona comunque: ellissoide (niente rilievo) +
 * imagery satellitare Esri World Imagery (uso development/demo) o OSM.
 */
const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;

export function hasIonToken(): boolean {
  return Boolean(ionToken);
}

export async function createTerrain(): Promise<TerrainProvider> {
  if (ionToken) {
    Ion.defaultAccessToken = ionToken;
    // Cesium World Terrain (asset 1)
    return CesiumTerrainProvider.fromUrl(await IonResource.fromAssetId(1), {
      requestVertexNormals: true,
    });
  }
  return new EllipsoidTerrainProvider();
}

export async function createImageryLayer(): Promise<ImageryLayer> {
  try {
    const esri = await ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGis/rest/services/World_Imagery/MapServer',
    );
    return new ImageryLayer(esri);
  } catch {
    return new ImageryLayer(
      new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
    );
  }
}
