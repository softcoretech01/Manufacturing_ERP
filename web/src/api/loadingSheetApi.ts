import { api } from "./client";
import type { LoadingSheet } from "@/types/dispatch";

export const loadingSheetApi = {
  getAll: async () => {
    return await api.get<LoadingSheet[]>("/dispatch/loading-sheets");
  },

  getById: async (id: number) => {
    return await api.get<LoadingSheet>(`/dispatch/loading-sheets/${id}`);
  },

  create: async (data: Partial<LoadingSheet>) => {
    return await api.post<LoadingSheet>("/dispatch/loading-sheets", data);
  },

  update: async (id: number, data: Partial<LoadingSheet>) => {
    return await api.put<LoadingSheet>(`/dispatch/loading-sheets/${id}`, data);
  },

  delete: async (id: number) => {
    return await api.del(`/dispatch/loading-sheets/${id}`);
  }
};
