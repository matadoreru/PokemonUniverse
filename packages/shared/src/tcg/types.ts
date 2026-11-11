export interface TcgSetOption { id: string; name: string; cardCount: number }
export interface TcgRarityOption { value: string; cardCount: number }
export interface TcgGenerationOption { value: number; cardCount: number }
export interface TcgFilterOptions {
  ready: boolean;
  cardCount: number;
  generations: TcgGenerationOption[];
  sets: TcgSetOption[];
  rarities: TcgRarityOption[];
}
