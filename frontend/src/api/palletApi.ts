import { api } from "./client";
import type { Pallet } from "@/types/dispatch";

export const palletApi = {
  getAll: async () => {
    return await api.get<Pallet[]>("/dispatch/pallets");
  },

  getById: async (id: number) => {
    return await api.get<Pallet>(`/dispatch/pallets/${id}`);
  },

  create: async (data: Partial<Pallet>) => {
    return await api.post<Pallet>("/dispatch/pallets", data);
  },

  update: async (id: number, data: Partial<Pallet>) => {
    return await api.put<Pallet>(`/dispatch/pallets/${id}`, data);
  },

  delete: async (id: number) => {
    return await api.del(`/dispatch/pallets/${id}`);
  }
};
