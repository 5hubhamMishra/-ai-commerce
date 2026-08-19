export type ShopAIConfig = {
  anthropicApiKey: string;
  model: string;
  maxToolIterations: number;
};

export const SHOPAI_CONFIG = Symbol('SHOPAI_CONFIG');
