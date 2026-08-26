/** System parameters — company-scoped typed configuration values. */

import { api } from './client'

export interface Parameter {
  uid: string
  version: number
  param_key: string
  name: string
  param_group: string
  value_type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'
  value: string
  default_value: string
  description: string | null
  scope: string
  is_sensitive: boolean
  options: string[] | null
}

export interface ParameterChange {
  param_key: string
  value: string
}

export const parameters = {
  list: () => api.get<Parameter[]>('/parameters'),
  update: (changes: ParameterChange[]) => api.put<Parameter[]>('/parameters', { changes }),
}
