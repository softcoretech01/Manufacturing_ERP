import { api } from "./client";
import type { Vehicle } from "@/types/dispatch";

export const vehicleApi = {
  getAll: async () => {
    return await api.get<Vehicle[]>("/dispatch/vehicles");
  },

  getById: async (id: number) => {
    return await api.get<Vehicle>(`/dispatch/vehicles/${id}`);
  },

  create: async (data: Partial<Vehicle>) => {
    return await api.post<Vehicle>("/dispatch/vehicles", data);
  },

  update: async (id: number, data: Partial<Vehicle>) => {
    return await api.put<Vehicle>(`/dispatch/vehicles/${id}`, data);
  },

  delete: async (id: number) => {
    return await api.del(`/dispatch/vehicles/${id}`);
  }
};
