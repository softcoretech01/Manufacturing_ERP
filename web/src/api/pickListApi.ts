import { api } from "./client";
import type { PickList } from "@/types/dispatch";

export const pickListApi = {
  getAll: async () => {
    return await api.get<PickList[]>("/dispatch/pick-lists");
  },

  getById: async (id: number) => {
    return await api.get<PickList>(`/dispatch/pick-lists/${id}`);
  },

  create: async (data: Partial<PickList>) => {
    return await api.post<PickList>("/dispatch/pick-lists", data);
  },

  update: async (id: number, data: Partial<PickList>) => {
    return await api.put<PickList>(`/dispatch/pick-lists/${id}`, data);
  },

  delete: async (id: number) => {
    return await api.del(`/dispatch/pick-lists/${id}`);
  }
};
