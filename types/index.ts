export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  genre: string | null;
  status: 'development' | 'pre_production' | 'production' | 'post_production' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  title: string;
  scene_number: number;
  description: string | null;
  location: string | null;
  time_of_day: 'day' | 'night' | 'dawn' | 'dusk' | null;
  interior_exterior: 'interior' | 'exterior' | null;
  canvas_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type AssetType = 'character' | 'prop' | 'set' | 'vehicle' | 'wardrobe' | 'other';

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  type: AssetType;
  description: string | null;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SceneAsset {
  id: string;
  scene_id: string;
  asset_id: string;
  position_x: number;
  position_y: number;
  scale: number;
  rotation: number;
  z_index: number;
  asset?: Asset;
}
