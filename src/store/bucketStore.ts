import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PCComponent, Laptop } from '@/lib/recommendationEngine';

export type BucketItemType = 'component' | 'laptop' | 'prebuilt';

export interface BucketItem {
  id: string; // unique string (e.g., sku or model + timestamp)
  type: BucketItemType;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  productData: PCComponent | Laptop | Record<string, PCComponent>; // The full object for reference
}

interface BucketState {
  items: BucketItem[];
  isOpen: boolean;
  addItem: (item: Omit<BucketItem, 'id' | 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearBucket: () => void;
  setIsOpen: (isOpen: boolean) => void;
  getTotalPrice: () => number;
}

export const useBucketStore = create<BucketState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      addItem: (newItem) => {
        const id = `${newItem.name}-${Date.now()}`;
        set((state) => {
          // Check if item with same name already exists to increment quantity
          const existingItemIndex = state.items.findIndex(i => i.name === newItem.name);
          if (existingItemIndex >= 0) {
             const newItems = [...state.items];
             newItems[existingItemIndex] = { ...newItems[existingItemIndex], quantity: newItems[existingItemIndex].quantity + 1 };
             return { items: newItems, isOpen: true }; // Open bucket on add
          }
          return { items: [...state.items, { ...newItem, id, quantity: 1 }], isOpen: true };
        });
      },
      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),
      updateQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item
          ),
        })),
      clearBucket: () => set({ items: [] }),
      setIsOpen: (isOpen) => set({ isOpen }),
      getTotalPrice: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
      },
    }),
    {
      name: 'chipchart-bucket-storage',
    }
  )
);
