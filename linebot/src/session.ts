import { gas, type Row, type StartInfo } from "./gas.js";

// 一則訊息的查詢工作階段：同一張資料表只向系統讀一次

export type FetchMany = (lineUserId: string, tables: string[]) => Promise<Record<string, Row[] | null>>;

const fetchFromGas: FetchMany = (lineUserId, tables) => gas.call(lineUserId, "getMany", { tables });

export class Session {
  private cache = new Map<string, Row[] | null>();

  constructor(public lineUserId: string, public info: StartInfo, private fetchMany: FetchMany = fetchFromGas) {}

  /** 這個人可以讀取的資料表 */
  canRead(table: string): boolean {
    return !!this.info.tables?.some((t) => t.name === table);
  }

  /** 有其中一個權限（最高管理員都有） */
  hasPerm(...ids: number[]): boolean {
    const perms = this.info.perms ?? [];
    return perms.includes(13) || ids.some((id) => perms.includes(id));
  }

  label(col: string): string {
    return this.info.labels?.[col] ?? col;
  }

  /** 讀取資料表（沒有權限的回傳 null） */
  async tables(names: string[]): Promise<Record<string, Row[] | null>> {
    const need = names.filter((n) => this.canRead(n) && !this.cache.has(n));
    if (need.length) {
      const res = await this.fetchMany(this.lineUserId, need);
      need.forEach((n) => this.cache.set(n, Array.isArray(res?.[n]) ? res[n] : null));
    }
    return Object.fromEntries(names.map((n) => [n, this.canRead(n) ? (this.cache.get(n) ?? null) : null]));
  }
}
