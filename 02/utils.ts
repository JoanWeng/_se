import { createDefine } from "fresh";
import type { AuthUser } from "./lib/auth-types.ts";

// 這是 ctx.state 的型別，中介層、layouts 與 routes 共用。
// user / sessionId 由 routes/_middleware.ts 填入，routes 直接讀 ctx.state。
export interface State {
  user: AuthUser | null;
  /** sessions.id（token 的 SHA-256），登出時要拿來撤銷 */
  sessionId: string | null;
}

export const define = createDefine<State>();
