/** The complete allowed-tool registry — only instances collected under this
 *  token are ever callable by the LLM (see ShopAIModule). A tool name the
 *  model might hallucinate that isn't in this list simply never matches
 *  anything in ShopAIService's dispatch loop. */
export const SHOPAI_TOOLS = Symbol('SHOPAI_TOOLS');
