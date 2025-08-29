export type Property = {
  id: string
  name: string
  description: string
  contact: string
  transaction_type: string
  property_type: string
  sale_price: number | null
  rental_price: number | null
  rental_period: string | null
  coords: { lat: number; lng: number }
  owner_id: string
  owner_username: string
  images: string[]
  created_at: string
}

export type User = {
  id: string
  username: string
  role: 'user' | 'owner'
}
