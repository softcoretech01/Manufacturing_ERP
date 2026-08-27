import { api } from "./client";
import type { LabelFormat } from "@/types/dispatch";

export const labelApi = {
  getAll: async () => {
    return await api.get<LabelFormat[]>("/dispatch/labels");
  },

  getById: async (id: number) => {
    return await api.get<LabelFormat>(`/dispatch/labels/${id}`);
  },

  create: async (data: Partial<LabelFormat>) => {
    return await api.post<LabelFormat>("/dispatch/labels", data);
  },

  update: async (id: number, data: Partial<LabelFormat>) => {
    return await api.put<LabelFormat>(`/dispatch/labels/${id}`, data);
  },

  delete: async (id: number) => {
    return await api.del(`/dispatch/labels/${id}`);
  }
};
