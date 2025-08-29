import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Property } from '../types/supabase'

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  const addProperty = async (propertyData: Omit<Property, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('properties')
      .insert([propertyData])
      .select()

    if (error) throw error
    return data?.[0]
  }

  const updateProperty = async (id: string, updates: Partial<Property>) => {
    const { data, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data?.[0]
  }

  const deleteProperty = async (id: string) => {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Restante da lógica de propriedades...

  return {
    properties,
    loading,
    addProperty,
    updateProperty,
    deleteProperty
  }
}
