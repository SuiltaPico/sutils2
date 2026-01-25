import { LevelConfig, EnemyTemplate, OperatorTemplate } from './types';

const DB_NAME = 'ArknightsTD_DB';
const STORE_LEVELS = 'custom_levels';
const STORE_ENEMIES = 'custom_enemies';
const STORE_OPERATORS = 'custom_operators';
const DB_VERSION = 2;

export const db = {
  async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_LEVELS)) {
          db.createObjectStore(STORE_LEVELS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_ENEMIES)) {
          db.createObjectStore(STORE_ENEMIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_OPERATORS)) {
          db.createObjectStore(STORE_OPERATORS, { keyPath: 'id' });
        }
      };
    });
  },

  async saveLevel(level: LevelConfig): Promise<void> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_LEVELS, 'readwrite');
      const store = transaction.objectStore(STORE_LEVELS);
      
      if (!level.id || typeof level.id === 'number') {
          level.id = crypto.randomUUID();
      }

      const request = store.put(level);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAllLevels(): Promise<LevelConfig[]> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_LEVELS, 'readonly');
      const store = transaction.objectStore(STORE_LEVELS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteLevel(id: string | number): Promise<void> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_LEVELS, 'readwrite');
      const store = transaction.objectStore(STORE_LEVELS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // --- Enemies ---
  async saveEnemy(enemy: EnemyTemplate): Promise<void> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_ENEMIES, 'readwrite');
      const store = transaction.objectStore(STORE_ENEMIES);
      if (!enemy.id) enemy.id = crypto.randomUUID();
      const request = store.put(enemy);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAllEnemies(): Promise<EnemyTemplate[]> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_ENEMIES, 'readonly');
      const store = transaction.objectStore(STORE_ENEMIES);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteEnemy(id: string): Promise<void> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_ENEMIES, 'readwrite');
      const store = transaction.objectStore(STORE_ENEMIES);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // --- Operators ---
  async saveOperator(op: OperatorTemplate): Promise<void> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_OPERATORS, 'readwrite');
      const store = transaction.objectStore(STORE_OPERATORS);
      if (!op.id) op.id = crypto.randomUUID();
      const request = store.put(op);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAllOperators(): Promise<OperatorTemplate[]> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_OPERATORS, 'readonly');
      const store = transaction.objectStore(STORE_OPERATORS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteOperator(id: string): Promise<void> {
    const dbInstance = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction(STORE_OPERATORS, 'readwrite');
      const store = transaction.objectStore(STORE_OPERATORS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

