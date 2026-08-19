import { api } from "./client";
import type { DispatchPlan } from "@/types/dispatch";

export const dispatchPlanApi = {
  getAll: async () => {
    return await api.get<DispatchPlan[]>("/dispatch/plans");
  },

  getById: async (id: number) => {
    return await api.get<DispatchPlan>(`/dispatch/plans/${id}`);
  },

  create: async (data: Partial<DispatchPlan>) => {
    return await api.post<DispatchPlan>("/dispatch/plans", data);
  },

  update: async (id: number, data: Partial<DispatchPlan>) => {
    return await api.put<DispatchPlan>(`/dispatch/plans/${id}`, data);
  },

  delete: async (id: number) => {
    return await api.del(`/dispatch/plans/${id}`);
  }
};
