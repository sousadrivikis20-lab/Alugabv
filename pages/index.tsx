import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import dynamic from 'next/dynamic'
import type { Property } from '../types/supabase'

// Carrega o mapa dinamicamente apenas no cliente
const Map = dynamic(() => import('../components/Map'), { ssr: false })

export default function Home() {
  const [properties, setProperties] = useState<Property[]>([])
  
  useEffect(() => {
    const fetchProperties = async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
      
      if (error) {
        console.error('Error fetching properties:', error)
      } else {
        setProperties(data || [])
      }
    }

    fetchProperties()
  }, [])

  return (
    <div className="container">
      {/* Resto do seu HTML atual */}
    </div>
  )
}
