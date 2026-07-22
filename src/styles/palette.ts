export interface MapPalette {
  background: string;
  land: string;
  land_green: string;
  water: string;
  road_casing: string;
  road_fill: string;
  road_tunnel_fill: string;
  building: string;
  label_main: string;
  label_minor: string;
  label_halo: string;
  rail: string;
  border: string;
  aeroway: string;
}

export const DEFAULT_PALETTE: MapPalette = {
  background: 'rgba(63, 72, 62, 1)',
  land: 'rgba(55, 83, 76, 1)',
  land_green: 'rgba(49, 57, 44, 0.7)',
  water: 'rgba(78, 122, 202, 1)',
  road_casing: '#e9ac77',
  road_fill: '#fc8',
  road_tunnel_fill: '#fff4c6',
  building: 'rgba(147, 129, 118, 1)',
  label_main: 'rgba(224, 224, 224, 1)',
  label_minor: '#666',
  label_halo: 'rgba(255, 255, 255, 0.7)',
  rail: '#bbb',
  border: '#9e9cab',
  aeroway: '#f0ede9',
};
