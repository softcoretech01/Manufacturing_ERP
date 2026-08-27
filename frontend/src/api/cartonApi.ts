import { api } from "./client";
import type { Carton } from "@/types/dispatch";

export const cartonApi = {
  getAll: async () => {
    return await api.get<Carton[]>("/dispatch/cartons");
  },

  getById: async (id: number) => {
    return await api.get<Carton>(`/dispatch/cartons/${id}`);
  },

  create: async (data: Partial<Carton>) => {
    return await api.post<Carton>("/dispatch/cartons", data);
  },

  update: async (id: number, data: Partial<Carton>) => {
    return await api.put<Carton>(`/dispatch/cartons/${id}`, data);
  },

  delete: async (id: number) => {
    return await api.del(`/dispatch/cartons/${id}`);
  }
};
