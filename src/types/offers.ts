/** Risposta strutturata dalla funzione Edge `vegan-offers`. */
export type VeganOfferProduct = {
  name: string
  price: string
  originalPrice: string
  discount: string
  validUntil: string
  notes: string
}

export type VeganOfferSupermarket = {
  name: string
  items: VeganOfferProduct[]
  /** Se non ci sono prodotti, messaggio da mostrare (es. “Nessuna offerta…”). */
  emptyMessage: string | null
}

export type VeganOfferBestDeal = VeganOfferProduct & {
  supermarket?: string
  rationale?: string
}

export type VeganOffersResult = {
  supermarkets: VeganOfferSupermarket[]
  bestDeals: VeganOfferBestDeal[]
  modelNote?: string | null
}
