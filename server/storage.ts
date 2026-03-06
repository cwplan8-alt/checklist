import {
  checklists,
  checklistItems,
  type Checklist,
  type ChecklistItem,
  type InsertChecklist,
  type InsertChecklistItem,
  type ChecklistWithItems
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { createDb } from "./db";

export interface IStorage {
  createChecklist(checklist: InsertChecklist): Promise<Checklist>;
  getChecklist(id: number): Promise<ChecklistWithItems | undefined>;
  getChecklistByShareToken(token: string): Promise<ChecklistWithItems | undefined>;
  updateChecklistProgress(id: number, completedItems: number): Promise<void>;
  createChecklistItems(items: InsertChecklistItem[]): Promise<ChecklistItem[]>;
  updateChecklistItem(id: number, isCompleted: boolean): Promise<ChecklistItem | undefined>;
  getAllChecklists(): Promise<Checklist[]>;
}

export class MemStorage implements IStorage {
  private checklists: Map<number, Checklist>;
  private checklistItems: Map<number, ChecklistItem>;
  private currentChecklistId: number;
  private currentItemId: number;

  constructor() {
    this.checklists = new Map();
    this.checklistItems = new Map();
    this.currentChecklistId = 1;
    this.currentItemId = 1;
  }

  async createChecklist(insertChecklist: InsertChecklist): Promise<Checklist> {
    const id = this.currentChecklistId++;
    const checklist: Checklist = {
      id,
      sourceUrl: insertChecklist.sourceUrl,
      title: insertChecklist.title,
      totalItems: insertChecklist.totalItems || 0,
      completedItems: insertChecklist.completedItems || 0,
      createdAt: new Date(),
    };
    this.checklists.set(id, checklist);
    return checklist;
  }

  async getChecklist(id: number): Promise<ChecklistWithItems | undefined> {
    const checklist = this.checklists.get(id);
    if (!checklist) return undefined;

    const items = Array.from(this.checklistItems.values())
      .filter(item => item.checklistId === id)
      .sort((a, b) => a.order - b.order);

    return { ...checklist, items };
  }

  async getChecklistByShareToken(token: string): Promise<ChecklistWithItems | undefined> {
    const checklist = Array.from(this.checklists.values()).find(c => c.shareToken === token);
    if (!checklist) return undefined;
    return this.getChecklist(checklist.id);
  }

  async updateChecklistProgress(id: number, completedItems: number): Promise<void> {
    const checklist = this.checklists.get(id);
    if (checklist) {
      this.checklists.set(id, { ...checklist, completedItems });
    }
  }

  async createChecklistItems(items: InsertChecklistItem[]): Promise<ChecklistItem[]> {
    const createdItems: ChecklistItem[] = [];

    for (const item of items) {
      const id = this.currentItemId++;
      const checklistItem: ChecklistItem = {
        id,
        checklistId: item.checklistId,
        text: item.text,
        isCompleted: item.isCompleted ?? false,
        order: item.order,
      };
      this.checklistItems.set(id, checklistItem);
      createdItems.push(checklistItem);
    }

    return createdItems;
  }

  async updateChecklistItem(id: number, isCompleted: boolean): Promise<ChecklistItem | undefined> {
    const item = this.checklistItems.get(id);
    if (item) {
      const updated = { ...item, isCompleted };
      this.checklistItems.set(id, updated);
      return updated;
    }
    return undefined;
  }

  async getAllChecklists(): Promise<Checklist[]> {
    return Array.from(this.checklists.values());
  }
}

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof createDb>;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for DatabaseStorage");
    }
    this.db = createDb(process.env.DATABASE_URL);
  }

  async createChecklist(insertChecklist: InsertChecklist): Promise<Checklist> {
    const [checklist] = await this.db
      .insert(checklists)
      .values(insertChecklist)
      .returning();
    return checklist;
  }

  async getChecklist(id: number): Promise<ChecklistWithItems | undefined> {
    const [checklist] = await this.db
      .select()
      .from(checklists)
      .where(eq(checklists.id, id));

    if (!checklist) return undefined;

    const items = await this.db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, id))
      .orderBy(checklistItems.order);

    return { ...checklist, items };
  }

  async getChecklistByShareToken(token: string): Promise<ChecklistWithItems | undefined> {
    const [checklist] = await this.db
      .select()
      .from(checklists)
      .where(eq(checklists.shareToken, token));

    if (!checklist) return undefined;

    const items = await this.db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklist.id))
      .orderBy(checklistItems.order);

    return { ...checklist, items };
  }

  async updateChecklistProgress(id: number, completedItems: number): Promise<void> {
    await this.db
      .update(checklists)
      .set({ completedItems })
      .where(eq(checklists.id, id));
  }

  async createChecklistItems(items: InsertChecklistItem[]): Promise<ChecklistItem[]> {
    if (items.length === 0) return [];
    return await this.db.insert(checklistItems).values(items).returning();
  }

  async updateChecklistItem(id: number, isCompleted: boolean): Promise<ChecklistItem | undefined> {
    const [item] = await this.db
      .update(checklistItems)
      .set({ isCompleted })
      .where(eq(checklistItems.id, id))
      .returning();
    return item ?? undefined;
  }

  async getAllChecklists(): Promise<Checklist[]> {
    return await this.db.select().from(checklists);
  }
}

export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new MemStorage();
